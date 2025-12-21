import React, { useEffect, useState, useContext } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  Modal,
  Dimensions,
} from "react-native";
import { useTheme } from "../../context/ThemeContext";
import { supabase } from "../../config/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import OddsDisplayContext from "../../context/OddsDisplayContext";
import {
  getUserProfile,
  getDailyRewardState,
  claimDailyReward,
} from "../../services/betService";

const BetSettingsScreen = ({ navigation }) => {
  const { theme, colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [profileMeta, setProfileMeta] = useState(null);

  // Odds display: prefer context if provider mounted, otherwise local state
  const oddsContext = useContext(OddsDisplayContext);
  const [localOddsDisplay, setLocalOddsDisplay] = useState("american");
  const oddsDisplay = oddsContext ? oddsContext.oddsDisplay : localOddsDisplay;
  const setOddsDisplay = oddsContext
    ? oddsContext.setOddsDisplay
    : setLocalOddsDisplay;

  // Ensure changes are persisted and logged even if provider isn't mounted
  const handleSetOddsDisplay = async (value) => {
    try {
      console.log(
        "BetSettings: requested odds display change ->",
        value,
        "(context:",
        !!oddsContext,
        ")"
      );
      if (oddsContext && oddsContext.setOddsDisplay) {
        oddsContext.setOddsDisplay(value);
      } else {
        setLocalOddsDisplay(value);
      }
      try {
        await AsyncStorage.setItem("@odds_display", value);
        const stored = await AsyncStorage.getItem("@odds_display");
        console.log("BetSettings: persisted @odds_display =", stored);
      } catch (e) {
        console.error("BetSettings: failed to persist odds display", e);
      }
    } catch (e) {
      console.error("BetSettings: error setting odds display", e);
    }
  };

  // Persist local odds preference if context provider is not used
  useEffect(() => {
    if (oddsContext) return;
    AsyncStorage.setItem("@odds_display", localOddsDisplay).catch(() => {});
  }, [localOddsDisplay, oddsContext]);

  // Fetch profile (basic) and profileMeta (richer) on mount
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        setLoading(true);
        // basic profile via supabase auth
        try {
          const {
            data: { user },
            error: userErr,
          } = await supabase.auth.getUser();
          if (!user || userErr) {
            if (mounted) setProfile(null);
          } else {
            const { data, error } = await supabase
              .from("profiles")
              .select("username, credits, created_at")
              .eq("id", user.id)
              .maybeSingle();
            if (!error && mounted) {
              setProfile(data || null);
            }
          }
        } catch (e) {
          console.warn("Error loading basic profile", e);
        }

        // richer profile meta via service (may resolve profileId from token)
        try {
          const res = await getUserProfile();
          if (mounted && res && res.success && res.profile) {
            setProfileMeta(res.profile);
          }
        } catch (e) {
          // ignore
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  // On returning to this screen, silently refresh profile link and credits
  useEffect(() => {
    const onFocus = navigation.addListener("focus", async () => {
      try {
        const res = await getUserProfile();
        if (res && res.success && res.profile) {
          // store profile id for later use
          try {
            if (res.profile.id) {
              await AsyncStorage.setItem("@profile_id", res.profile.id);
            }
          } catch (e) {
            // ignore storage errors
          }

          // Only update credits shown silently
          setProfileMeta((prev) => {
            if (!prev) return res.profile;
            return { ...prev, credits: res.profile.credits };
          });
          setProfile((prev) => {
            if (!prev) return prev;
            return { ...prev, credits: res.profile.credits };
          });
        }
      } catch (e) {
        // silent fail
        console.warn(
          "BetSettings: silent profile refresh failed",
          e?.message || e
        );
      }
    });

    return onFocus;
  }, [navigation]);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      try {
        await AsyncStorage.removeItem("bet_credentials_v1");
      } catch (e) {}
      navigation.navigate("BetLogin");
    } catch (e) {
      console.error("Sign out failed", e);
    }
  };

  // Info modal / carousel
  const [infoVisible, setInfoVisible] = useState(false);
  const [infoPage, setInfoPage] = useState(0);
  const [dailyVisible, setDailyVisible] = useState(false);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyState, setDailyState] = useState(null);
  const [dailyCountdownLabel, setDailyCountdownLabel] = useState("");
  const screenWidth = Dimensions.get("window").width;
  const width = screenWidth - 64; // modal padding
  const sidePadding = Math.max(12, Math.round((screenWidth - width) / 2));

  const infoPages = [
    {
      title: "Player Props",
      body: "Player props are generated from historical gamelog data and aggregated statistics. \n\n A server collects recent game stats, seasonal stats, computes rolling aggregates (last 5/10), and derives candidate prop lines from those distributions.",
    },
    {
      title: "Odds Calculation",
      body: "Odds are derived from internal probability heuristics. An internal servers maps probability of specific props to preditermined odds increments (e.g. a probability of >= 0.75 will be given -300). \n\n These odds don't reflect real-world betting lines and are for gameplay purposes only.",
    },
    {
      title: "Credits System",
      body: "All wagers use app credits (C). Credits have no real-world value. They are used only for gameplay only and cannot be bought, sold, or redeemed for cash.",
    },
    {
      title: "How To Read Odds",
      body: "American odds (e.g. -200) and Decimal odds (e.g. 1.50) are two display formats; the app stores your display preference. \n\n American odds: Positive odds (e.g. +150) indicate profit on a $100 bet, while negative odds (e.g. -200) indicate the amount needed to bet to win $100. \n\n Decimal odds represent total payout (stake + profit) per unit bet. For example, 1.50 means a $1 bet returns $1.50 total.",
    },
  ];

  function onInfoScroll(e) {
    const px = e.nativeEvent.contentOffset.x;
    const idx = Math.round(px / (width + 16));
    if (idx !== infoPage) setInfoPage(idx);
  }

  // Claim daily reward (used by modal). After claim we refresh profile credits.
  const handleClaimDaily = async () => {
    try {
      setDailyLoading(true);
      const profileId =
        profileMeta?.id || (await getUserProfile())?.profile?.id;
      if (!profileId) return;
      console.log("handleClaimDaily: attempting claim", { profileId });
      const claimRes = await claimDailyReward(profileId);
      console.log("handleClaimDaily: claimDailyReward result", claimRes);
      // refresh profile credits
      const refreshed = await getUserProfile();
      console.log("handleClaimDaily: refreshed profile", refreshed);
      if (refreshed && refreshed.success && refreshed.profile) {
        setProfileMeta((prev) => {
          if (!prev) return refreshed.profile;
          return { ...prev, credits: refreshed.profile.credits };
        });
        setProfile((prev) => {
          if (!prev) return prev;
          return { ...prev, credits: refreshed.profile.credits };
        });
      }
      // refresh daily state and compute derived `canClaim` flag
      const state = await getDailyRewardState(profileId);
      console.log("handleClaimDaily: new daily state from server", state);
      try {
        let canClaim;
        if (state && typeof state.canClaim !== "undefined") {
          canClaim = state.canClaim;
        } else {
          const claimedArr =
            state && state.claimedDays ? state.claimedDays : [];
          const avail = state && state.availableDay ? state.availableDay : null;
          canClaim = avail && !claimedArr[avail - 1];
          console.log(
            "handleClaimDaily: computed canClaim =",
            canClaim,
            "claimedArr=",
            claimedArr,
            "availableDay=",
            avail
          );
        }
        setDailyState({ ...(state || {}), canClaim });
      } catch (e) {
        setDailyState(state);
      }
      if (claimRes && claimRes.success) {
        setDailyVisible(false);
      } else {
        console.warn(
          "handleClaimDaily: claim did not succeed, keeping modal open",
          claimRes && claimRes.error
        );
      }
    } catch (e) {
      console.warn("BetSettings: claim failed", e);
    } finally {
      setDailyLoading(false);
    }
  };

  // Open daily modal (reused by Account button and new Settings section)
  const openDailyModal = async () => {
    try {
      setDailyLoading(true);
      const profileId =
        profileMeta?.id || (await getUserProfile())?.profile?.id;
      if (!profileId) {
        setDailyState(null);
        setDailyVisible(true);
        return;
      }
      const state = await getDailyRewardState(profileId);
      console.log("openDailyModal: daily state from server", state);
      try {
        const serverCan =
          state && typeof state.canClaim !== "undefined"
            ? state.canClaim
            : null;
        const claimedArr = state && state.claimedDays ? state.claimedDays : [];
        const avail = state && state.availableDay ? state.availableDay : null;
        const computedCan = avail && !claimedArr[avail - 1];
        // parse nextAvailableAt if present
        let nextDiff = null;
        if (state && state.nextAvailableAt) {
          try {
            const nextDate = new Date(state.nextAvailableAt);
            nextDiff = Math.max(
              0,
              Math.round((nextDate.getTime() - Date.now()) / 1000)
            );
          } catch (e) {
            nextDiff = null;
          }
        }
        console.log(
          "openDailyModal: serverCan=",
          serverCan,
          "computedCan=",
          computedCan,
          "claimedArr=",
          claimedArr,
          "availableDay=",
          avail,
          "nextAvailableInSec=",
          nextDiff
        );
        const canClaim = serverCan !== null ? serverCan : computedCan;
        setDailyState({ ...(state || {}), canClaim });
      } catch (e) {
        setDailyState(state);
      }
      setDailyVisible(true);
    } catch (e) {
      console.warn("Failed to open daily reward", e);
      setDailyState(null);
      setDailyVisible(true);
    } finally {
      setDailyLoading(false);
    }
  };

  // Update countdown label while daily modal is visible
  useEffect(() => {
    let timer = null;
    function computeLabel(state) {
      try {
        if (!state) return "No reward available yet";
        if (state.canClaim) return "Available";
        const next = state.nextAvailableAt
          ? new Date(state.nextAvailableAt)
          : null;
        if (next) {
          const diff = next.getTime() - Date.now();
          if (diff <= 0) return "Available";
          const days = Math.floor(diff / (24 * 60 * 60 * 1000));
          const hours = Math.floor(
            (diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000)
          );
          const mins = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
          const secs = Math.floor((diff % (60 * 1000)) / 1000);
          return `Available in ${hours}H ${mins}M ${secs}S`;
        }
        return state.availableDay
          ? `Day ${state.availableDay} available`
          : "No reward available yet";
      } catch (e) {
        return state && state.availableDay
          ? `Day ${state.availableDay} available`
          : "No reward available yet";
      }
    }

    if (dailyVisible) {
      setDailyCountdownLabel(computeLabel(dailyState));
      timer = setInterval(() => {
        setDailyCountdownLabel(computeLabel(dailyState));
      }, 1000);
    } else {
      setDailyCountdownLabel("");
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [dailyVisible, dailyState]);

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <View style={styles.content}>
        <View
          style={[
            styles.section,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <View
            style={[styles.sectionHeader, { borderBottomColor: theme.border }]}
          >
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Account
            </Text>
          </View>

          <View style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ alignItems: "center" }}>
                <View
                  style={[
                    styles.customBlockInner,
                    {
                      backgroundColor: colors.primary,
                      alignItems: "center",
                      justifyContent: "center",
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: "#fff",
                      fontWeight: "700",
                      fontSize: 36,
                    }}
                  >
                    {profile && profile.username && profile.username[0]
                      ? profile.username[0].toUpperCase()
                      : "?"}
                  </Text>
                </View>
                <View
                  style={{ marginTop: 8, alignItems: "center", marginLeft: -5 }}
                >
                  <Text style={{ color: theme.textSecondary, fontSize: 10 }}>
                    {profileMeta && profileMeta.created_at
                      ? new Date(profileMeta.created_at).toLocaleDateString(
                          "en-US",
                          {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            timeZone: "America/New_York",
                          }
                        )
                      : ""}
                  </Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 10 }}>
                    {profileMeta && profileMeta.created_at
                      ? new Date(profileMeta.created_at).toLocaleTimeString(
                          "en-US",
                          {
                            hour: "numeric",
                            minute: "2-digit",
                            hour12: true,
                            timeZone: "America/New_York",
                          }
                        ) + " EST"
                      : ""}
                  </Text>
                </View>
              </View>
              <View style={{ marginLeft: 15, flex: 1 }}>
                <Text
                  style={{ color: theme.text, fontWeight: "700", fontSize: 18 }}
                >
                  {profile?.username || "User"}
                </Text>
                <Text style={{ color: theme.textSecondary, marginTop: 6 }}>
                  {profileMeta && profileMeta.credits != null
                    ? `${profileMeta.credits.toFixed(2)} Credits`
                    : ""}
                </Text>
                {/* Daily button moved to its own section below */}
              </View>
            </View>
          </View>
        </View>

        <View
          style={[
            styles.section,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <View
            style={[styles.sectionHeader, { borderBottomColor: theme.border }]}
          >
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Daily Login Reward
            </Text>
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={[styles.settingLabel, { color: theme.text }]}>
                Daily Login Reward
              </Text>
              <Text
                style={[
                  styles.settingDescription,
                  { color: theme.textSecondary },
                ]}
              >
                Claim your daily credits reward
              </Text>
            </View>
            <TouchableOpacity
              onPress={openDailyModal}
              style={[
                styles.openSettingsButton,
                { backgroundColor: colors.primary, minWidth: 100 },
              ]}
            >
              <Text style={styles.openSettingsButtonText}>
                {dailyLoading ? "Loading" : "Open"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View
          style={[
            styles.section,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <View
            style={[styles.sectionHeader, { borderBottomColor: theme.border }]}
          >
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Odds Display
            </Text>
          </View>

          <View style={[styles.settingBody, { padding: 12 }]}>
            <View style={styles.oddsButtonsRow}>
              <TouchableOpacity
                onPress={() => handleSetOddsDisplay("american")}
                style={[
                  styles.oddsButton,
                  oddsDisplay === "american"
                    ? { backgroundColor: colors.primary }
                    : { backgroundColor: theme.border },
                  { marginRight: 8 },
                ]}
              >
                <Text
                  style={[
                    styles.oddsNumber,
                    { color: oddsDisplay === "american" ? "#fff" : theme.text },
                  ]}
                >
                  {"-200"}
                </Text>
                <Text
                  style={[
                    styles.oddsLabel,
                    {
                      color:
                        oddsDisplay === "american"
                          ? "#fff"
                          : theme.textSecondary,
                    },
                  ]}
                >
                  American
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleSetOddsDisplay("decimal")}
                style={[
                  styles.oddsButton,
                  oddsDisplay === "decimal"
                    ? { backgroundColor: colors.primary }
                    : { backgroundColor: theme.border },
                  { marginLeft: 8 },
                ]}
              >
                <Text
                  style={[
                    styles.oddsNumber,
                    { color: oddsDisplay === "decimal" ? "#fff" : theme.text },
                  ]}
                >
                  {"1.50"}
                </Text>
                <Text
                  style={[
                    styles.oddsLabel,
                    {
                      color:
                        oddsDisplay === "decimal"
                          ? "#fff"
                          : theme.textSecondary,
                    },
                  ]}
                >
                  Decimal
                </Text>
              </TouchableOpacity>
            </View>

            <Text
              style={[
                styles.settingDescription,
                {
                  color: theme.textSecondary,
                  marginTop: 10,
                  textAlign: "center",
                },
              ]}
            >
              Choose how odds are shown across betting screens
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.section,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <View
            style={[styles.sectionHeader, { borderBottomColor: theme.border }]}
          >
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Info
            </Text>
          </View>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={[styles.settingLabel, { color: theme.text }]}>
                How SportsHeart Bet works
              </Text>
              <Text
                style={[
                  styles.settingDescription,
                  { color: theme.textSecondary },
                ]}
              >
                Tap to learn how everything works
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setInfoVisible(true)}
              style={[
                styles.openSettingsButton,
                { backgroundColor: colors.primary, minWidth: 100 },
              ]}
            >
              <Text style={styles.openSettingsButtonText}>Info</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <Modal
        visible={infoVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setInfoVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <View
              style={[
                {
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.border,
                },
              ]}
            >
              <Text style={{ color: theme.text, fontWeight: "700" }}>
                SportsHeart Bet Info
              </Text>
              <TouchableOpacity onPress={() => setInfoVisible(false)}>
                <Text style={{ color: colors.primary, fontWeight: "700" }}>
                  Close
                </Text>
              </TouchableOpacity>
            </View>

            <View
              style={{
                paddingHorizontal: sidePadding,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <View style={[styles.carouselPage, { width: width }]}>
                <Text
                  style={{
                    color: theme.text,
                    fontWeight: "700",
                    fontSize: 16,
                    marginBottom: 8,
                    textAlign: "center",
                  }}
                >
                  {infoPages[infoPage].title}
                </Text>
                <Text
                  style={{
                    color: theme.textSecondary,
                    fontSize: 13,
                    lineHeight: 20,
                    textAlign: "center",
                  }}
                >
                  {infoPages[infoPage].body}
                </Text>
              </View>

              <View style={[styles.dotsContainer, { alignItems: "center" }]}>
                <TouchableOpacity
                  onPress={() => setInfoPage((p) => Math.max(0, p - 1))}
                  disabled={infoPage === 0}
                  style={{ paddingHorizontal: 12 }}
                >
                  <Text
                    style={{
                      color:
                        infoPage === 0 ? theme.textSecondary : colors.primary,
                    }}
                  >
                    {"Prev"}
                  </Text>
                </TouchableOpacity>

                {infoPages.map((_, i) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => setInfoPage(i)}
                    style={{ paddingHorizontal: 6 }}
                  >
                    <View
                      style={[
                        styles.dot,
                        infoPage === i ? styles.dotActive : null,
                      ]}
                    />
                  </TouchableOpacity>
                ))}

                <TouchableOpacity
                  onPress={() => {
                    if (infoPage === infoPages.length - 1)
                      return setInfoVisible(false);
                    setInfoPage((p) => Math.min(infoPages.length - 1, p + 1));
                  }}
                  style={{ paddingHorizontal: 12 }}
                >
                  <Text
                    style={{
                      color:
                        infoPage === infoPages.length - 1
                          ? colors.primary
                          : colors.primary,
                    }}
                  >
                    {infoPage === infoPages.length - 1 ? "Done" : "Next"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={dailyVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setDailyVisible(false)}
      >
        <View
          style={[
            styles.modalOverlay,
            { justifyContent: "center", alignItems: "center" },
          ]}
        >
          <View
            style={[
              styles.modalContent,
              {
                maxWidth: 640,
                backgroundColor: theme.background,
                borderColor: theme.border,
              },
            ]}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                padding: 12,
                borderBottomWidth: 1,
                borderBottomColor: theme.border,
              }}
            >
              <Text style={{ color: theme.text, fontWeight: "700" }}>
                Daily Login Reward
              </Text>
              <TouchableOpacity onPress={() => setDailyVisible(false)}>
                <Text style={{ color: colors.primary, fontWeight: "700" }}>
                  Close
                </Text>
              </TouchableOpacity>
            </View>

            <View style={{ padding: 18, alignItems: "center" }}>
              <Text
                style={{ color: theme.text, fontSize: 16, marginBottom: 8 }}
              >
                Claim your daily credits
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "center",
                  marginVertical: 12,
                  flexWrap: "wrap",
                }}
              >
                {(dailyState && dailyState.claimedDays
                  ? dailyState.claimedDays
                  : new Array(7).fill(false)
                ).map((claimed, i) => (
                  <View
                    key={i}
                    style={{
                      width: 72,
                      height: 72,
                      margin: 8,
                      borderRadius: 12,
                      backgroundColor: theme.surface,
                      borderWidth: 1,
                      borderColor: theme.border,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        color: theme.text,
                        fontWeight: "700",
                        fontSize: 18,
                      }}
                    >
                      {i + 1}
                    </Text>
                    <Text
                      style={{
                        color: theme.textSecondary,
                        fontSize: 12,
                        marginTop: 6,
                      }}
                    >
                      {i < 6 ? "$250.00" : "$1000.00"}
                    </Text>
                    {claimed ? (
                      <View
                        style={{
                          position: "absolute",
                          right: -6,
                          top: -6,
                          backgroundColor: "#28a745",
                          width: 28,
                          height: 28,
                          borderRadius: 14,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Ionicons name="checkmark" size={16} color="#fff" />
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>

              <Text
                style={{
                  color: theme.textSecondary,
                  textAlign: "center",
                  marginBottom: 18,
                }}
              >
                {dailyCountdownLabel ||
                  (dailyState && dailyState.availableDay
                    ? ""
                    : "No reward available yet")}
              </Text>

              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <TouchableOpacity
                  disabled={
                    !(dailyState && dailyState.canClaim) || dailyLoading
                  }
                  onPress={handleClaimDaily}
                  style={[
                    styles.dailyPrimaryButton,
                    {
                      marginRight: 12,
                      opacity: dailyState && dailyState.canClaim ? 1 : 0.6,
                    },
                  ]}
                >
                  {dailyLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.dailyPrimaryText}>
                      {dailyState && dailyState.canClaim
                        ? "Claim"
                        : "Unavailable"}
                    </Text>
                  )}
                </TouchableOpacity>

                {/* Reset removed */}

                <TouchableOpacity
                  onPress={() => setDailyVisible(false)}
                  style={styles.dailySecondaryButton}
                >
                  <Text style={styles.dailySecondaryText}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 20,
    alignItems: "flex-start",
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    marginBottom: 8,
  },
  content: {
    padding: 16,
  },
  section: {
    marginBottom: 16,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  sectionHeader: {
    padding: 12,
    borderBottomWidth: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
  },
  settingInfo: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 12,
  },
  openSettingsButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  openSettingsButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  customBlockInner: {
    width: 56,
    height: 56,
    borderRadius: 12,
    marginRight: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  accountBubble: {
    padding: 12,
    margin: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "transparent",
  },
  settingBody: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  oddsButtonsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  oddsButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  oddsNumber: {
    fontSize: 16,
    fontWeight: "700",
  },
  oddsLabel: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  modalContent: {
    width: "100%",
    maxWidth: 720,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    paddingBottom: 16,
  },
  carouselPage: {
    paddingVertical: 18,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  dotsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    paddingVertical: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    marginHorizontal: 6,
  },
  dotActive: {
    backgroundColor: "#fff",
  },
  dailyPrimaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: "#c62828",
    alignItems: "center",
    justifyContent: "center",
  },
  dailyPrimaryText: {
    color: "#fff",
    fontWeight: "700",
  },
  dailySecondaryButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  dailySecondaryText: {
    color: "#c62828",
    fontWeight: "700",
  },
});

export default BetSettingsScreen;

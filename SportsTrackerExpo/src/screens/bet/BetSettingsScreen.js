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
  Alert,
  TextInput,
  Image,
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
import { useBetSlip } from "../../context/BetSlipContext";
import {
  initPurchases,
  getOfferings,
  getCustomerInfo,
  restorePurchases,
} from "../../services/revenuecat";

const BetSettingsScreen = ({ navigation }) => {
  const { theme, colors } = useTheme();
  const { isPro, setIsPro } = useBetSlip();
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
        ")",
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
              .select("username, credits, created_at, is_pro")
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
          e?.message || e,
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

  // Purchases / RevenueCat UI state
  const [proModalVisible, setProModalVisible] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [monthlyPackage, setMonthlyPackage] = useState(null);
  const [lifetimePackage, setLifetimePackage] = useState(null);
  const [yearlyPackage, setYearlyPackage] = useState(null);
  const [purchasesAvailable, setPurchasesAvailable] = useState(false);
  const [supabaseUserId, setSupabaseUserId] = useState(null);
  const [debugVisible, setDebugVisible] = useState(false);
  const [debugLoading, setDebugLoading] = useState(false);
  const [debugResult, setDebugResult] = useState(null);
  // Promo code redeem state
  const [promoCodeInput, setPromoCodeInput] = useState("");
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [redeemMessage, setRedeemMessage] = useState(null);
  const [promoModalVisible, setPromoModalVisible] = useState(false);

  const infoPages = [
    {
      title: "Odds and Lines",
      body: "All odds and betting lines are retreived from FanDuel and DraftKings through SportsGameOdds API. There may be delays or discrepancies compared to live sportsbook lines along with some odds not being available.",
    },
    {
      title: "Credits System",
      body: "All wagers use app credits (C). Credits have no real-world value. They are used only for gameplay only and cannot be bought, sold, or redeemed for cash.",
    },
    {
      title: "Leaderboards",
      body: "The weekly leaderboard ranks the top 50 bettors by their multiplier — the amount they've multiplied their starting-week credits. The large value is the multiplier (for example, 3.50 means a starting 100 C became 350 C). Each row also shows total bets and the date of the user's first bet this week. Leaderboards are calculated per-week and reset at Sunday 02:00 PST.",
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
      try {
        const sup = claimRes?.supabaseUpdate;
        const supMsg = sup
          ? `${sup.success ? "Supabase write: OK" : "Supabase write: FAILED"}${
              sup.error
                ? `\nError: ${sup.error.message || JSON.stringify(sup.error)}`
                : ""
            }`
          : "Supabase write: n/a";
      } catch (e) {
        console.warn("handleClaimDaily: failed to show alert", e);
      }
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
            avail,
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
          claimRes && claimRes.error,
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
      console.log("openDailyModal: isPro from context", { isPro });
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
              Math.round((nextDate.getTime() - Date.now()) / 1000),
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
          nextDiff,
        );
        // Prefer server `canClaim` but allow computed availability to override an inconsistent false
        const canClaim =
          serverCan !== null ? serverCan || computedCan : computedCan;
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
            (diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000),
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

  // capture supabase user id for RevenueCat mapping
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (mounted && user && user.id) setSupabaseUserId(user.id);
      } catch (e) {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Initialize RevenueCat Purchases SDK if available (graceful fallback)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // If profile already grants Pro, skip RevenueCat initialization
        if (isPro) {
          console.log(
            "BetSettings: skipping RevenueCat init because user is Pro from profile",
          );
          if (mounted) setPurchasesAvailable(false);
          return;
        }

        // Use our helper with the iOS SDK key (test key for debugging)
        const initRes = await initPurchases(
          "appl_mdoICWLxVPeKJjUzLbFUKhMrXAT",
          supabaseUserId,
        );
        if (!initRes || !initRes.ok) {
          console.warn(
            "RevenueCat init failed or skipped",
            initRes && initRes.error,
          );
          if (mounted) setPurchasesAvailable(false);
          // capture debug info
          try {
            setDebugResult({ timestamp: new Date().toISOString(), initRes });
          } catch (e) {}
          return;
        }

        // Small delay to allow SDK to sync with RevenueCat servers
        await new Promise((resolve) => setTimeout(resolve, 1500));

        // fetch offerings via helper with retry logic
        let offerings = await getOfferings();
        // Retry once if first fetch returns null (SDK still syncing)
        if (!offerings) {
          console.log(
            "RevenueCat: first fetch returned null, retrying after delay...",
          );
          await new Promise((resolve) => setTimeout(resolve, 1500));
          offerings = await getOfferings();
        }
        console.log("RevenueCat: raw offerings ->", offerings);
        // capture offerings for debug when absent
        if (!offerings) {
          try {
            setDebugResult({
              timestamp: new Date().toISOString(),
              initRes,
              offerings: null,
              error: "no_offerings_returned",
            });
          } catch (e) {}
        }
        if (offerings) {
          try {
            setDebugResult((prev) => ({
              ...(prev || {}),
              timestamp: new Date().toISOString(),
              initRes,
              offerings,
            }));
          } catch (e) {}
          // Prefer the project offering named `com.sportsheart.pro` if present
          const preferredOffering =
            (offerings.all && offerings.all["com.sportsheart.pro"]) ||
            offerings.current ||
            null;
          const pkgs =
            (preferredOffering && preferredOffering.availablePackages) || [];
          // try to find by packageType or product identifier patterns
          const monthly =
            pkgs.find((p) => /month|monthly/i.test(p.product.identifier)) ||
            pkgs.find((p) => p.packageType === "MONTHLY") ||
            pkgs[0] ||
            null;
          const yearly =
            pkgs.find((p) => /year|annual/i.test(p.product.identifier)) ||
            pkgs.find((p) => p.packageType === "ANNUAL") ||
            pkgs[1] ||
            null;
          const lifetime =
            pkgs.find((p) =>
              /life|lifetime|forever|permanent/i.test(p.product.identifier),
            ) ||
            pkgs.find((p) => /non.?renew/i.test(p.product.identifier)) ||
            pkgs.find((p) => p.packageType === "LIFETIME") ||
            null;
          if (mounted) {
            setMonthlyPackage(monthly);
            setYearlyPackage(yearly);
            setLifetimePackage(lifetime);
            setPurchasesAvailable(true);
          }
        } else {
          if (mounted) setPurchasesAvailable(false);
        }
      } catch (e) {
        console.warn("RevenueCat init error", e?.message || e);
        try {
          setDebugResult({
            timestamp: new Date().toISOString(),
            error: e?.message || String(e),
          });
        } catch (ee) {}
        if (mounted) setPurchasesAvailable(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [supabaseUserId]);

  // Debug helper: explicitly re-run init + getOfferings and capture detailed results
  const fetchOfferingsDebug = async () => {
    try {
      setDebugLoading(true);
      const out = { timestamp: new Date().toISOString() };
      try {
        const initRes = await initPurchases(
          "appl_mdoICWLxVPeKJjUzLbFUKhMrXAT",
          supabaseUserId,
        );
        out.initRes = initRes;
        // Small delay to allow SDK to sync
        await new Promise((resolve) => setTimeout(resolve, 1500));
      } catch (ie) {
        out.initError = String(ie?.message || ie);
      }
      try {
        let offerings = await getOfferings();
        // Retry once if null
        if (!offerings) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          offerings = await getOfferings();
        }
        out.offerings = offerings;
        if (offerings) {
          out.preferred =
            (offerings.all && offerings.all["com.sportsheart.pro"]) ||
            offerings.current ||
            null;
          out.availablePackages =
            out.preferred && out.preferred.availablePackages
              ? out.preferred.availablePackages.map((p) => ({
                  id: p.identifier || p.product?.identifier,
                  productId: p.product?.identifier,
                  packageType: p.packageType,
                }))
              : [];
        }
      } catch (oe) {
        out.offeringsError = String(oe?.message || oe);
      }
      console.log("RevenueCat debug result:", out);
      // include last daily-claim diagnostics if available
      try {
        const pid = profileMeta?.id || supabaseUserId || null;
        if (pid) {
          const respRaw = await AsyncStorage.getItem(
            `@daily_claim_last_response_${pid}`,
          );
          const supRaw = await AsyncStorage.getItem(
            `@daily_claim_last_supabase_${pid}`,
          );
          out.dailyClaimDiagnostics = {
            serverResponse: respRaw ? JSON.parse(respRaw) : null,
            supabaseUpdate: supRaw ? JSON.parse(supRaw) : null,
          };
        }
      } catch (e) {
        out.dailyClaimDiagnosticsError = String(e?.message || e);
      }
      setDebugResult(out);
      setDebugVisible(true);
    } catch (e) {
      console.warn("fetchOfferingsDebug failed", e);
      try {
        setDebugResult({
          timestamp: new Date().toISOString(),
          error: String(e),
        });
        setDebugVisible(true);
      } catch (ee) {}
    } finally {
      setDebugLoading(false);
    }
  };

  // Purchase handlers (use Purchases SDK where available)
  const handleBuy = async (which) => {
    try {
      setIsPurchasing(true);
      let Purchases;
      try {
        Purchases = require("react-native-purchases").default;
      } catch (e) {
        Alert.alert(
          "Purchases not available",
          "Native Purchases SDK is not installed. See setup instructions.",
        );
        return;
      }
      let targetPackage = null;
      if (which === "monthly") targetPackage = monthlyPackage;
      else if (which === "yearly") targetPackage = yearlyPackage;
      else if (which === "lifetime") targetPackage = lifetimePackage;

      if (!targetPackage) {
        Alert.alert("Unavailable", "Selected subscription is not available.");
        return;
      }
      // proceed to purchase
      const purchaseResult = await Purchases.purchasePackage(targetPackage);
      console.log("Purchase result", purchaseResult);
      Alert.alert(
        "Purchase successful",
        "Thank you — your subscription is now active.",
      );
      // Refresh profile from server to pick up pro status
      try {
        const refreshed = await getUserProfile();
        if (refreshed && refreshed.success && refreshed.profile) {
          setProfile(refreshed.profile);
          setProfileMeta(refreshed.profile);
          try {
            await AsyncStorage.setItem(
              "@is_pro",
              refreshed.profile.is_pro ? "1" : "0",
            );
            // update context quickly so UI updates immediately
            try {
              if (setIsPro) setIsPro(!!refreshed.profile.is_pro);
            } catch (e) {}
          } catch (e) {}
        }
      } catch (e) {
        console.warn("purchase: failed to refresh profile", e?.message || e);
      }
    } catch (e) {
      console.warn("Purchase failed", e?.message || e);
      Alert.alert("Purchase failed", e?.message || "Unknown error");
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleRestore = async () => {
    try {
      const restored = await restorePurchases();
      console.log("Restore result", restored);
      Alert.alert("Restore complete", "Your subscription is now restored.");
      // Refresh profile after restore
      try {
        const refreshed = await getUserProfile();
        if (refreshed && refreshed.success && refreshed.profile) {
          setProfile(refreshed.profile);
          setProfileMeta(refreshed.profile);
          try {
            await AsyncStorage.setItem(
              "@is_pro",
              refreshed.profile.is_pro ? "1" : "0",
            );
            // update context quickly so UI updates immediately
            try {
              if (setIsPro) setIsPro(!!refreshed.profile.is_pro);
            } catch (e) {}
          } catch (e) {}
        }
      } catch (e) {
        console.warn("restore: failed to refresh profile", e?.message || e);
      }
    } catch (e) {
      console.warn("Restore failed", e?.message || e);
      Alert.alert("Restore failed", e?.message || "Unknown error");
    }
  };

  // Redeem promo code (calls server /api/promo/redeem)
  const handleRedeemPromo = async () => {
    if (profile && profile.is_pro) {
      setRedeemMessage("You already have Pro");
      return;
    }
    try {
      setRedeemMessage(null);
      const code = (promoCodeInput || "").trim();
      if (!code) return setRedeemMessage("Enter a promo code");
      setRedeemLoading(true);
      let token = await AsyncStorage.getItem("@bet_token");
      // Fallback to Supabase session access token if no server token stored
      if (!token) {
        try {
          const { data } = await supabase.auth.getSession();
          token = data?.session?.access_token || null;
        } catch (e) {
          // ignore
        }
      }

      const base =
        process.env.PUBLIC_API_URL || "https://sportsheart-main.up.railway.app";
      if (!base) {
        setRedeemMessage("Server not configured");
        setRedeemLoading(false);
        return;
      }
      const url = base.replace(/\/$/, "") + "/api/promo/redeem";
      const headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const resp = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ code }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        setRedeemMessage(json?.message || "Redeem failed");
      } else {
        // If server returned already_pro, respect that
        if (json?.message === "already_pro") {
          setRedeemMessage("You already have Pro");
          // close promo modal if open
          try {
            setPromoModalVisible(false);
          } catch (e) {}
          // refresh profile
          const { data: userData } = await supabase.auth.getUser();
          const userId = userData?.user?.id || null;
          if (userId) {
            const { data: profileRow } = await supabase
              .from("profiles")
              .select("id, is_pro, credits")
              .eq("id", userId)
              .maybeSingle();
            if (profileRow) setProfile(profileRow);
          }
          // ensure local pro flag set
          try {
            await AsyncStorage.setItem("@is_pro", "1");
            if (setIsPro) setIsPro(true);
          } catch (e) {}
        } else {
          setRedeemMessage("Promo applied — enjoy Pro!");
          // close promo modal on success
          try {
            setPromoModalVisible(false);
          } catch (e) {}
          // clear input
          setPromoCodeInput("");
          // refresh profile state: fetch full profile from Supabase to preserve username/is_pro
          try {
            const { data: userData } = await supabase.auth.getUser();
            const userId = userData?.user?.id || null;
            if (userId) {
              const { data: profileRow, error: pErr } = await supabase
                .from("profiles")
                .select("id, username, is_pro, credits, created_at")
                .eq("id", userId)
                .maybeSingle();
              if (profileRow) {
                setProfile(profileRow);
                setProfileMeta(profileRow);
                try {
                  await AsyncStorage.setItem(
                    "@is_pro",
                    profileRow.is_pro ? "1" : "0",
                  );
                  if (setIsPro) setIsPro(!!profileRow.is_pro);
                } catch (e) {}
              } else if (json && json.profile) {
                // fallback: merge returned profile fields with existing
                setProfile((prev) => ({
                  ...(prev || {}),
                  ...(json.profile || {}),
                }));
                setProfileMeta((prev) => ({
                  ...(prev || {}),
                  ...(json.profile || {}),
                }));
                try {
                  const proFlag = json.profile.is_pro;
                  await AsyncStorage.setItem("@is_pro", proFlag ? "1" : "0");
                  if (setIsPro) setIsPro(!!proFlag);
                } catch (e) {}
              } else {
                console.warn(
                  "promo redeem: could not refresh profile (no user id and no server profile)",
                );
              }
            } else if (json && json.profile) {
              setProfile((prev) => ({
                ...(prev || {}),
                ...(json.profile || {}),
              }));
              setProfileMeta((prev) => ({
                ...(prev || {}),
                ...(json.profile || {}),
              }));
            } else {
              console.warn(
                "promo redeem: could not determine current user id to refresh profile",
              );
            }
          } catch (e) {
            console.warn("promo refresh profile error", e?.message || e);
          }
        }
      }
    } catch (e) {
      console.warn("promo redeem error", e?.message || e);
      setRedeemMessage("Redeem failed");
    } finally {
      setRedeemLoading(false);
    }
  };

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
              <View style={{ alignItems: "center", position: "relative" }}>
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
                {profile && profile.is_pro ? (
                  <View
                    style={{
                      position: "absolute",
                      right: 0,
                      bottom: 30,
                    }}
                  >
                    <View
                      style={[
                        {
                          backgroundColor: theme.background,
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                          borderRadius: 6,
                          borderWidth: 1,
                          borderColor: theme.border,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          fontWeight: "700",
                          fontSize: 10,
                          color: theme.text,
                        }}
                      >
                        PRO
                      </Text>
                    </View>
                  </View>
                ) : null}
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
                          },
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
                          },
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
                    ? `${Number(profileMeta.credits).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })} Credits`
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
                How SportsHeart Picks works
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
                SportsHeart Picks Info
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
        visible={debugVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setDebugVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              { backgroundColor: theme.surface, borderColor: theme.border },
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
                RevenueCat Debug
              </Text>
              <TouchableOpacity onPress={() => setDebugVisible(false)}>
                <Text style={{ color: colors.primary, fontWeight: "700" }}>
                  Close
                </Text>
              </TouchableOpacity>
            </View>

            <View style={{ padding: 12, maxHeight: 440 }}>
              <ScrollView>
                <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                  {debugResult
                    ? JSON.stringify(debugResult, null, 2)
                    : "No debug data yet."}
                </Text>
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={proModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setProModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            {/* Header */}
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
                Get Pro
              </Text>
              <TouchableOpacity onPress={() => setProModalVisible(false)}>
                <Text style={{ color: colors.primary, fontWeight: "700" }}>
                  Close
                </Text>
              </TouchableOpacity>
            </View>

            {/* Scrollable Body */}
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 18 }}
            >
              {/* Logo + Title */}
              <View style={{ alignItems: "center", marginBottom: 12 }}>
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 32,
                    backgroundColor: colors.primary,
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 8,
                  }}
                >
                  <Image
                    source={require("../../../assets/33115791.png")}
                    style={{
                      width: 50,
                      height: 50,
                      resizeMode: "contain",
                      shadowColor: "#000000",
                      shadowOpacity: 1,
                      shadowRadius: 5,
                      shadowOffset: { width: 0, height: 2 },
                    }}
                  />
                </View>

                <Text
                  style={{ color: theme.text, fontWeight: "700", fontSize: 18 }}
                >
                  SportsHeart Pro
                </Text>
              </View>

              {/* Features */}
              {[
                {
                  title: "No ads",
                  desc: "Enjoy a clean, distraction-free experience.",
                  icon: "close-circle",
                  color: "#FF5252",
                },
                {
                  title: "Custom Color Themes",
                  desc: "Access exclusive color themes for the app.",
                  icon: "color-palette",
                  color: "#FF5722",
                },
                {
                  title: "500 extra credits daily",
                  desc: "Receive extra bonus credits added every day.",
                  icon: "flash",
                  color: "#FFC107",
                },
                {
                  title: "Double credit payouts",
                  desc: "Earn twice the credits on bets.",
                  icon: "trending-up",
                  color: "#4CAF50",
                },
                {
                  title: "Player insights",
                  desc: "Unlock advanced stats to make smarter bets.",
                  icon: "analytics",
                  color: "#2196F3",
                },
                {
                  title: "More coming soon",
                  desc: "New Pro-only features added regularly.",
                  icon: "rocket",
                  color: "#9C27B0",
                },
              ].map((f, i) => (
                <View
                  key={i}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 10,
                  }}
                >
                  <Ionicons
                    name={f.icon}
                    size={26}
                    color={f.color}
                    style={{ marginRight: 12 }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontWeight: "700" }}>
                      {f.title}
                    </Text>
                    <Text
                      style={{
                        color: theme.textSecondary,
                        fontSize: 12,
                        marginTop: 2,
                      }}
                    >
                      {f.desc}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>

            {/* Fixed Bottom Actions */}
            <View style={{ paddingHorizontal: 18, paddingBottom: 12 }}>
              <View
                style={[styles.packageRow, { marginTop: 12, marginBottom: 12 }]}
              >
                <TouchableOpacity
                  onPress={() => handleBuy("monthly")}
                  disabled={!monthlyPackage || isPurchasing}
                  style={[
                    styles.packageButton,
                    {
                      backgroundColor: colors.primary,
                      opacity: !monthlyPackage || isPurchasing ? 0.6 : 1,
                    },
                  ]}
                >
                  <Text style={styles.packagePrice}>
                    {monthlyPackage?.product?.priceString || "$0.00"}
                  </Text>
                  <Text style={styles.packageLabel}>Monthly</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => handleBuy("yearly")}
                  disabled={!yearlyPackage || isPurchasing}
                  style={[
                    styles.packageButton,
                    {
                      backgroundColor: colors.primary,
                      opacity: !yearlyPackage || isPurchasing ? 0.6 : 1,
                    },
                  ]}
                >
                  <Text style={styles.packagePrice}>
                    {yearlyPackage?.product?.priceString || "$0.00"}
                  </Text>
                  <Text style={styles.packageLabel}>Yearly</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => handleBuy("lifetime")}
                  disabled={!lifetimePackage || isPurchasing}
                  style={[
                    styles.packageButton,
                    {
                      backgroundColor: colors.primary,
                      opacity: !lifetimePackage || isPurchasing ? 0.6 : 1,
                    },
                  ]}
                >
                  <Text style={styles.packagePrice}>
                    {lifetimePackage?.product?.priceString || "$0.00"}
                  </Text>
                  <Text style={styles.packageLabel}>Lifetime</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                onPress={handleRestore}
                style={styles.dailySecondaryButton}
              >
                <Text style={styles.dailySecondaryText}>Restore Purchases</Text>
              </TouchableOpacity>
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
                      {i < 6
                        ? isPro
                          ? "750.00 C"
                          : "250.00 C"
                        : isPro
                          ? "1,500.00 C"
                          : "1,000.00 C"}
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
                  onPress={async () => {
                    console.log("BetSettings: Claim button pressed", {
                      time: new Date().toISOString(),
                      profileId: profileMeta?.id,
                      dailyState,
                    });
                    try {
                      await handleClaimDaily();
                    } catch (e) {
                      console.warn("BetSettings: handleClaimDaily threw", e);
                    }
                  }}
                  style={[
                    styles.dailyPrimaryButton,
                    {
                      marginRight: 12,
                      opacity: dailyState && dailyState.canClaim ? 1 : 0.6,
                      backgroundColor: colors.primary,
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
                  <Text
                    style={[
                      styles.dailySecondaryText,
                      { color: colors.primary },
                    ]}
                  >
                    Close
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

// Helper to format pro expiry from profile row (always show days remaining)
const formatProExpiry = (expiresAt) => {
  if (!expiresAt) return null;
  try {
    const exp = new Date(expiresAt);
    const now = new Date();
    if (isNaN(exp.getTime())) return null;
    const diffMs = exp.getTime() - now.getTime();
    if (diffMs <= 0) return "Expired";
    // round to nearest whole day to avoid off-by-one when times differ by hours
    const totalDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
    return `${totalDays} day${totalDays === 1 ? "" : "s"} remaining`;
  } catch (e) {
    return null;
  }
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
  packageRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  packageButton: {
    flex: 1,
    marginHorizontal: 6,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  packagePrice: {
    fontSize: 18,
    fontWeight: "800",
    color: "#fff",
  },
  packageLabel: {
    marginTop: 6,
    fontSize: 12,
    color: "#fff",
    fontWeight: "700",
  },
  featureRowIcon: {
    width: 28,
    height: 28,
    marginRight: 12,
    resizeMode: "contain",
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

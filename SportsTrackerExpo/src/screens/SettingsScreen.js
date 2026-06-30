import React, { useState, useEffect, useContext } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Image,
  Animated,
  Alert,
  ActivityIndicator,
  Linking,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { useFavorites } from "../context/FavoritesContext";
import { useTheme } from "../context/ThemeContext";
import { useChat } from "../context/ChatContext";
import UpdateService from "../services/UpdateService";
import ImageCache from "../services/ImageCache";
import { supabase } from "../config/supabase";
import { useOnboarding } from "../context/OnboardingContext";

// Attempt to load optional color wheel/picker libraries if installed.
let OptionalColorWheel = null;
let OptionalColorPicker = null;
try {
  // react-native-color-wheel (exports ColorWheel as named or default)
  const wheel = require("react-native-color-wheel");
  OptionalColorWheel = (wheel && (wheel.ColorWheel || wheel.default)) || null;
} catch (e) {
  OptionalColorWheel = null;
}
try {
  // react-native-color-picker (exports ColorPicker as named or default)
  const picker = require("react-native-color-picker");
  OptionalColorPicker =
    (picker && (picker.ColorPicker || picker.default)) || null;
} catch (e) {
  OptionalColorPicker = null;
}

// Optional: reanimated-color-picker (preferred replacement)
let ReanimatedColorPicker = null;
let ReanimatedPanel1 = null;
let ReanimatedHueSlider = null;
let ReanimatedOpacitySlider = null;
let ReanimatedSwatches = null;
let ReanimatedPreview = null;
try {
  const re = require("reanimated-color-picker");
  ReanimatedColorPicker = (re && (re.ColorPicker || re.default)) || null;
  ReanimatedPanel1 = re && re.Panel1 ? re.Panel1 : null;
  ReanimatedHueSlider = re && re.HueSlider ? re.HueSlider : null;
  ReanimatedOpacitySlider = re && re.OpacitySlider ? re.OpacitySlider : null;
  ReanimatedSwatches = re && re.Swatches ? re.Swatches : null;
  ReanimatedPreview = re && re.Preview ? re.Preview : null;
} catch (e) {
  ReanimatedColorPicker = null;
}

import { useBetSlip } from "../context/BetSlipContext";
import { useAppSettings } from "../context/AppSettingsContext";

const SettingsScreen = ({ navigation }) => {
  const {
    isDarkMode,
    theme,
    colors,
    colorPalettes,
    currentColorPalette,
    toggleTheme,
    changeColorPalette,
    updateCustomPalette,
    getCurrentAppIcon,
  } = useTheme();
  const { isPro, setIsPro } = useBetSlip();
  const { showBetTab, setShowBetTab } = useAppSettings();
  const { resetOnboarding } = useOnboarding();
  const { favorites, removeFavorite, getFavoriteTeams, clearAllFavorites } =
    useFavorites();
  const {
    userName,
    userColor,
    updateUserName,
    updateUserColor,
    nameColors,
    resetChatProfile,
  } = useChat();

  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [tempUsername, setTempUsername] = useState(userName);
  const [colorModalVisible, setColorModalVisible] = useState(false);
  // Custom palette modal state
  const [customModalVisible, setCustomModalVisible] = useState(false);
  const [customTempColors, setCustomTempColors] = useState({
    primary: "#dc2626",
    secondary: "#ef4444",
    accent: "#f87171",
  });
  const [customSelectedTarget, setCustomSelectedTarget] = useState("primary");
  // Use a fixed wheel size to avoid NaN layout issues in native ImageView
  const FIXED_WHEEL_SIZE = 400;
  const [wheelSize] = useState(FIXED_WHEEL_SIZE);

  // Helper to accept a color value from wheel/picker and normalize to hex
  const handleWheelColorChange = (color) => {
    try {
      let hex = color;
      if (typeof color === "object") {
        // color-picker libs sometimes pass { hex: '#rrggbb' } or hsv objects
        hex =
          color.hex || (color && color.length) ? color : JSON.stringify(color);
      }
      if (!hex) return;
      // Ensure leading '#'
      if (typeof hex === "string" && !hex.startsWith("#")) hex = `#${hex}`;
      setCustomTempColors((s) => ({ ...s, [customSelectedTarget]: hex }));
    } catch (e) {
      // ignore
    }
  };

  // Username change restriction state
  const [lastUsernameChange, setLastUsernameChange] = useState(null);
  const [canChangeUsername, setCanChangeUsername] = useState(true);
  const [daysUntilNextChange, setDaysUntilNextChange] = useState(0);

  // Streaming code state
  const [streamingCode, setStreamingCode] = useState("");
  const [isStreamingUnlocked, setIsStreamingUnlocked] = useState(false);
  const [confirmClickCount, setConfirmClickCount] = useState(0);
  const [bannerAnimation] = useState(new Animated.Value(-100));
  const [showBanner, setShowBanner] = useState(false);
  const [bannerMessage, setBannerMessage] = useState("");
  const [bannerType, setBannerType] = useState("success"); // 'success' or 'error'

  // Update check state
  const [isCheckingForUpdates, setIsCheckingForUpdates] = useState(false);
  const [debugInfo, setDebugInfo] = useState(null);

  // Cache management state
  const [cacheStats, setCacheStats] = useState(null);
  const [isClearingCache, setIsClearingCache] = useState(false);

  // Pro / promo state
  const [promoCodeInput, setPromoCodeInput] = useState("");
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [redeemMessage, setRedeemMessage] = useState(null);
  const [promoModalVisible, setPromoModalVisible] = useState(false);
  const [freePromoLabel, setFreePromoLabel] = useState(
    "Loading free promo codes...",
  );

  // Account settings modal state
  const [accountModalVisible, setAccountModalVisible] = useState(false);
  const [changeUsernameVisible, setChangeUsernameVisible] = useState(false);
  const [changePasswordVisible, setChangePasswordVisible] = useState(false);
  const [accountCurrentPassword, setAccountCurrentPassword] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [confirmUsername, setConfirmUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accountActionLoading, setAccountActionLoading] = useState(false);

  // Supabase profile state
  const [supabaseProfile, setSupabaseProfile] = useState(null);
  const [supabaseUser, setSupabaseUser] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // Manual update check function
  const handleCheckForUpdates = async () => {
    setIsCheckingForUpdates(true);

    const debugData = {
      timestamp: new Date().toLocaleString(),
      __DEV__: __DEV__,
      executionEnvironment: Constants.executionEnvironment,
      platformOS: Platform.OS,
      updateCheckResult: null,
      updateInfo: null,
      callbackTriggered: null,
      error: null,
    };

    try {
      const result = await UpdateService.checkForUpdatesManually(
        // onUpdateAvailable
        () => {
          debugData.callbackTriggered = "onUpdateAvailable";
          showBannerMessage("Update downloaded! Restarting app...", "success");
        },
        // onNoUpdate
        () => {
          debugData.callbackTriggered = "onNoUpdate";
          showBannerMessage("You have the latest version!", "success");
        },
        // onError
        (error) => {
          debugData.callbackTriggered = `onError: ${error}`;
          showBannerMessage("Failed to check for updates", "error");
        },
        true, // Enable auto-restart
      );

      debugData.updateCheckResult = result;

      // Get additional update info for debugging
      const updateInfo = await UpdateService.getCurrentUpdateInfo();
      debugData.updateInfo = updateInfo;
    } catch (error) {
      debugData.error = error.message;
      showBannerMessage("Failed to check for updates", "error");
    } finally {
      setDebugInfo(debugData);
      setIsCheckingForUpdates(false);
    }
  };

  // Function to get the current app icon image source
  const getCurrentAppIconSource = () => {
    const theme = isDarkMode ? "dark" : "light";
    const iconMap = {
      dark_blue: require("../../assets/dark/blue.png"),
      dark_red: require("../../assets/dark/red.png"),
      dark_green: require("../../assets/dark/green.png"),
      dark_purple: require("../../assets/dark/purple.png"),
      dark_gold: require("../../assets/dark/gold.png"),
      dark_custom: require("../../assets/dark/custom.png"),
      light_blue: require("../../assets/light/blue.png"),
      light_red: require("../../assets/light/red.png"),
      light_green: require("../../assets/light/green.png"),
      light_purple: require("../../assets/light/purple.png"),
      light_gold: require("../../assets/light/gold.png"),
      light_custom: require("../../assets/light/custom.png"),
    };

    const iconKey = `${theme}_${currentColorPalette}`;
    return iconMap[iconKey] || iconMap["dark_red"]; // fallback to default
  };

  // Cache management functions
  const loadCacheStats = async () => {
    try {
      const stats = await ImageCache.getCacheStats();
      setCacheStats(stats);
    } catch (error) {
      console.error("Error loading cache stats:", error);
    }
  };

  const handleClearCache = () => {
    if (cacheStats?.platform === "web") {
      showBannerMessage(
        "Cache clearing not available on web platform",
        "error",
      );
      return;
    }

    Alert.alert(
      "Clear Emote Cache",
      `This will clear ${
        cacheStats?.formattedSize || "0 B"
      } of cached emotes. They will be re-downloaded when needed. Continue?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear Cache",
          style: "destructive",
          onPress: async () => {
            setIsClearingCache(true);
            try {
              await ImageCache.clearAllCache();
              await loadCacheStats(); // Refresh stats
              showBannerMessage("Cache cleared successfully!", "success");
            } catch (error) {
              console.error("Error clearing cache:", error);
              showBannerMessage("Error clearing cache", "error");
            } finally {
              setIsClearingCache(false);
            }
          },
        },
      ],
    );
  };

  const loadSupabaseProfile = async () => {
    setProfileLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setSupabaseUser(user || null);
      if (!user?.id) {
        setSupabaseProfile(null);
        return;
      }

      const { data: profileRow } = await supabase
        .from("profiles")
        .select("id,username,is_pro,pro_product_id,pro_expires_at,credits")
        .eq("id", user.id)
        .maybeSingle();

      setSupabaseProfile(profileRow || null);
    } catch (e) {
      console.warn("Settings: failed to load profile", e?.message || e);
    } finally {
      setProfileLoading(false);
    }
  };

  const loadFreePromoCode = async () => {
    try {
      const { data, error } = await supabase
        .from("promo_codes")
        .select('code, uses, max_uses, "Availability"')
        .limit(50);
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      const free = rows.filter((row) => {
        const availability = String(row?.Availability || "").toLowerCase();
        const uses = Number(row?.uses || 0);
        return availability.includes("free") && uses > 1;
      });
      if (free.length === 0) {
        setFreePromoLabel("No free promo codes");
        return;
      }
      free.sort((a, b) => Number(b?.uses || 0) - Number(a?.uses || 0));
      const best = free[0];
      const uses = Number(best?.uses || 0);
      const code = best?.code || "Promo";
      setFreePromoLabel(`Use: ${code}`);
    } catch (e) {
      setFreePromoLabel("No free promo codes");
    }
  };

  useEffect(() => {
    loadSupabaseProfile();
    loadFreePromoCode();
    const { data } = supabase.auth.onAuthStateChange(() => {
      loadSupabaseProfile();
      loadFreePromoCode();
    });
    return () => {
      if (data && data.subscription) data.subscription.unsubscribe();
    };
  }, []);

  // Check streaming unlock status on component mount
  useEffect(() => {
    checkStreamingUnlockStatus();
    checkUsernameChangeRestriction();
    loadCacheStats();
  }, []);

  const checkStreamingUnlockStatus = async () => {
    try {
      const unlocked = await AsyncStorage.getItem("streamingUnlocked");
      setIsStreamingUnlocked(unlocked === "true");
    } catch (error) {
      console.error("Error checking streaming unlock status:", error);
    }
  };

  const checkUsernameChangeRestriction = async () => {
    try {
      const lastChange = await AsyncStorage.getItem("lastUsernameChange");
      if (lastChange) {
        const lastChangeDate = new Date(lastChange);
        const currentDate = new Date();
        const daysDifference = Math.floor(
          (currentDate - lastChangeDate) / (1000 * 60 * 60 * 24),
        );
        const daysRemaining = 30 - daysDifference;

        if (daysRemaining > 0) {
          setCanChangeUsername(false);
          setDaysUntilNextChange(daysRemaining);
        } else {
          setCanChangeUsername(true);
          setDaysUntilNextChange(0);
        }
        setLastUsernameChange(lastChangeDate);
      } else {
        setCanChangeUsername(true);
        setDaysUntilNextChange(0);
      }
    } catch (error) {
      console.error("Error checking username change restriction:", error);
    }
  };

  const handleUsernameChange = async (newUsername) => {
    if (!canChangeUsername) {
      showBannerMessage(
        `You can change your username in ${daysUntilNextChange} days`,
        "error",
      );
      return;
    }

    try {
      const currentDate = new Date().toISOString();
      await AsyncStorage.setItem("lastUsernameChange", currentDate);
      updateUserName(newUsername);
      setCanChangeUsername(false);
      setDaysUntilNextChange(30);
      setLastUsernameChange(new Date(currentDate));
      showBannerMessage("Username changed successfully!", "success");
    } catch (error) {
      console.error("Error saving username change date:", error);
      showBannerMessage("Error updating username", "error");
    }
  };

  const showBannerMessage = (message, type = "success") => {
    setBannerMessage(message);
    setBannerType(type);
    setShowBanner(true);

    // Animate banner down
    Animated.timing(bannerAnimation, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();

    // Hide banner after 3 seconds
    setTimeout(() => {
      Animated.timing(bannerAnimation, {
        toValue: -100,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        setShowBanner(false);
      });
    }, 3000);
  };

  const handleStreamingCodeSubmit = async () => {
    // If text input is not yet unlocked, increment click count
    if (confirmClickCount < 3) {
      const newClickCount = confirmClickCount + 1;
      setConfirmClickCount(newClickCount);
    }

    // Original code submission logic (only runs when text input is unlocked)
    const correctCode = "20250417";

    if (streamingCode === correctCode) {
      try {
        await AsyncStorage.setItem("streamingUnlocked", "true");
        setIsStreamingUnlocked(true);
        setStreamingCode("");
        showBannerMessage("Success! Streaming is unlocked.", "success");
      } catch (error) {
        console.error("Error saving streaming unlock status:", error);
        showBannerMessage("Error saving unlock status.", "error");
      }
    } else {
      showBannerMessage("Wrong answer. Try again.", "error");
      setStreamingCode("");
    }
  };

  const handleResetStreamingAccess = () => {
    Alert.alert(
      "Reset Special Access",
      "This will remove your special access. Are you sure you want to continue?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Confirm",
          style: "destructive",
          onPress: async () => {
            try {
              await AsyncStorage.removeItem("streamingUnlocked");
              setIsStreamingUnlocked(false);
              setStreamingCode("");
              setConfirmClickCount(0); // Reset click count
              showBannerMessage("Special access has been reset.", "error");
            } catch (error) {
              console.error("Error resetting streaming access:", error);
            }
          },
        },
      ],
    );
  };

  const handleAppLogout = async () => {
    setProfileLoading(true);
    try {
      await supabase.auth.signOut();
      try {
        await AsyncStorage.removeItem("bet_credentials_v1");
        await AsyncStorage.removeItem("@bet_token");
      } catch (e) {}
      await resetChatProfile();
      setSupabaseProfile(null);
      setSupabaseUser(null);
      showBannerMessage("Logged out", "success");
    } catch (e) {
      console.error("Logout failed", e);
      showBannerMessage("Logout failed", "error");
    } finally {
      setProfileLoading(false);
    }
  };

  const verifyCurrentPassword = async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id || null;
      if (!userId) return { ok: false, message: "Not signed in" };
      const { data: profileRow, error } = await supabase
        .from("profiles")
        .select("id, password, username")
        .eq("id", userId)
        .maybeSingle();
      if (error) return { ok: false, message: "Profile fetch failed" };
      if (!profileRow) return { ok: false, message: "Profile not found" };
      if (profileRow.password !== accountCurrentPassword) {
        return { ok: false, message: "Current password is incorrect" };
      }
      return { ok: true, profileRow };
    } catch (e) {
      return { ok: false, message: "Unable to verify password" };
    }
  };

  const handleChangeUsernameSubmit = async () => {
    if (!newUsername || !confirmUsername) {
      showBannerMessage("Enter and confirm your new username", "error");
      return;
    }
    if (newUsername !== confirmUsername) {
      showBannerMessage("Usernames do not match", "error");
      return;
    }
    setAccountActionLoading(true);
    try {
      const verify = await verifyCurrentPassword();
      if (!verify.ok) {
        showBannerMessage(verify.message, "error");
        return;
      }

      const userId = verify.profileRow.id;
      const { error } = await supabase
        .from("profiles")
        .update({ username: newUsername })
        .eq("id", userId);
      if (error) {
        const msg = String(error.message || "Update failed");
        if (msg.toLowerCase().includes("duplicate")) {
          showBannerMessage("Username is already taken", "error");
        } else {
          showBannerMessage(msg, "error");
        }
        return;
      }
      setSupabaseProfile((prev) =>
        prev ? { ...prev, username: newUsername } : prev,
      );
      showBannerMessage("Username updated", "success");
      setChangeUsernameVisible(false);
      setAccountCurrentPassword("");
      setNewUsername("");
      setConfirmUsername("");
    } catch (e) {
      showBannerMessage("Failed to update username", "error");
    } finally {
      setAccountActionLoading(false);
    }
  };

  const handleChangePasswordSubmit = async () => {
    if (!newPassword || !confirmPassword) {
      showBannerMessage("Enter and confirm your new password", "error");
      return;
    }
    if (newPassword !== confirmPassword) {
      showBannerMessage("Passwords do not match", "error");
      return;
    }
    setAccountActionLoading(true);
    try {
      const verify = await verifyCurrentPassword();
      if (!verify.ok) {
        showBannerMessage(verify.message, "error");
        return;
      }

      const { error: authError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (authError) {
        showBannerMessage(
          authError.message || "Failed to update auth password",
          "error",
        );
        return;
      }

      const userId = verify.profileRow.id;
      const { error } = await supabase
        .from("profiles")
        .update({ password: newPassword })
        .eq("id", userId);
      if (error) {
        showBannerMessage("Failed to update password", "error");
        return;
      }
      showBannerMessage("Password updated", "success");
      setChangePasswordVisible(false);
      setAccountCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      showBannerMessage("Failed to update password", "error");
    } finally {
      setAccountActionLoading(false);
    }
  };

  const handleRedeemPromo = async () => {
    if (supabaseProfile && supabaseProfile.is_pro) {
      setRedeemMessage("You already have Pro");
      return;
    }
    try {
      setRedeemMessage(null);
      const code = (promoCodeInput || "").trim();
      if (!code) return setRedeemMessage("Enter a promo code");
      setRedeemLoading(true);
      let token = await AsyncStorage.getItem("@bet_token");
      if (!token) {
        try {
          const { data } = await supabase.auth.getSession();
          token = data?.session?.access_token || null;
        } catch (e) {}
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
      } else if (json?.message === "already_pro") {
        setRedeemMessage("You already have Pro");
        try {
          setPromoModalVisible(false);
        } catch (e) {}
        try {
          const { data: userData } = await supabase.auth.getUser();
          const userId = userData?.user?.id || null;
          if (userId) {
            const { data: profileRow } = await supabase
              .from("profiles")
              .select("id, username, is_pro, pro_product_id, pro_expires_at")
              .eq("id", userId)
              .maybeSingle();
            if (profileRow) setSupabaseProfile(profileRow);
          }
        } catch (e) {}
        try {
          await AsyncStorage.setItem("@is_pro", "1");
          if (setIsPro) setIsPro(true);
        } catch (e) {}
      } else {
        setRedeemMessage("Promo applied — enjoy Pro!");
        try {
          setPromoModalVisible(false);
        } catch (e) {}
        setPromoCodeInput("");
        try {
          const { data: userData } = await supabase.auth.getUser();
          const userId = userData?.user?.id || null;
          if (userId) {
            const { data: profileRow } = await supabase
              .from("profiles")
              .select("id, username, is_pro, pro_product_id, pro_expires_at")
              .eq("id", userId)
              .maybeSingle();
            if (profileRow) {
              setSupabaseProfile(profileRow);
              try {
                await AsyncStorage.setItem(
                  "@is_pro",
                  profileRow.is_pro ? "1" : "0",
                );
                if (setIsPro) setIsPro(!!profileRow.is_pro);
              } catch (e) {}
            }
          }
        } catch (e) {
          console.warn("promo refresh profile error", e?.message || e);
        }
      }
    } catch (e) {
      console.warn("promo redeem error", e?.message || e);
      setRedeemMessage("Redeem failed");
    } finally {
      setRedeemLoading(false);
    }
  };

  const handleViewOnboarding = async () => {
    await resetOnboarding();
    try {
      await AsyncStorage.removeItem("@pro_splash_seen");
    } catch (e) {}
    showBannerMessage("Opening onboarding...", "success");
  };

  const formatProExpiry = (expiresAt) => {
    if (!expiresAt) return null;
    try {
      const exp = new Date(expiresAt);
      const now = new Date();
      if (isNaN(exp.getTime())) return null;
      const diffMs = exp.getTime() - now.getTime();
      if (diffMs <= 0) return "Expired";
      const totalDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
      return `${totalDays} day${totalDays === 1 ? "" : "s"} remaining`;
    } catch (e) {
      return null;
    }
  };

  const formatCreatedAt = (createdAt) => {
    if (!createdAt) return null;
    try {
      const created = new Date(createdAt);
      if (isNaN(created.getTime())) return null;
      const now = new Date();
      const daysAgo = Math.max(
        0,
        Math.floor((now.getTime() - created.getTime()) / 86400000),
      );
      const dateLabel = created.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
      return `${dateLabel} (${daysAgo}d)`;
    } catch (e) {
      return null;
    }
  };

  const renderColorOption = (paletteKey, palette) => {
    if (paletteKey === "custom" && !isPro) return null;
    const isSelected = currentColorPalette === paletteKey;

    return (
      <TouchableOpacity
        key={paletteKey}
        style={[
          styles.colorOption1,
          {
            backgroundColor: theme.surface,
            borderColor: isSelected ? colors.primary : theme.border,
            borderWidth: isSelected ? 3 : 1,
          },
        ]}
        onPress={() => changeColorPalette(paletteKey)}
      >
        <View
          style={[styles.colorPreview, { backgroundColor: palette.primary }]}
        />
        <View style={styles.colorInfo}>
          <Text
            allowFontScaling={false}
            style={[styles.colorName, { color: theme.text }]}
          >
            {palette.name}
          </Text>
          <View style={styles.colorSwatch}>
            <View
              style={[styles.colorDot, { backgroundColor: palette.primary }]}
            />
            <View
              style={[styles.colorDot, { backgroundColor: palette.secondary }]}
            />
            <View
              style={[styles.colorDot, { backgroundColor: palette.accent }]}
            />
          </View>
        </View>
        {isSelected && (
          <View
            style={[
              styles.selectedIndicator,
              { backgroundColor: colors.primary },
            ]}
          >
            <Text allowFontScaling={false} style={styles.checkmark}>
              ✓
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const profileName = profileLoading
    ? "Loading..."
    : supabaseProfile?.username ||
      supabaseUser?.email ||
      supabaseUser?.phone ||
      "Not signed in";
  const createdAtLabel = profileLoading
    ? null
    : formatCreatedAt(supabaseUser?.created_at);
  const proActive = !!(supabaseProfile?.is_pro || isPro);
  const proExpiresLabel = formatProExpiry(supabaseProfile?.pro_expires_at);
  const proProductName = supabaseProfile?.pro_product_id
    ? String(supabaseProfile.pro_product_id).charAt(0).toUpperCase() +
      String(supabaseProfile.pro_product_id).slice(1)
    : "SportsHeart Pro";

  const show = true; // Set to true to enable debug info section

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Success/Error Banner */}
      {showBanner && (
        <Animated.View
          style={[
            styles.bannerContainer,
            {
              backgroundColor: bannerType === "success" ? "#4CAF50" : "#F44336",
              transform: [{ translateY: bannerAnimation }],
            },
          ]}
        >
          <Text allowFontScaling={false} style={styles.bannerText}>
            {bannerMessage}
          </Text>
        </Animated.View>
      )}

      <ScrollView style={{ flex: 1 }}>
        <View
          style={[
            styles.header,
            { backgroundColor: theme.surface, borderBottomColor: theme.border },
          ]}
        >
          <Text
            allowFontScaling={false}
            style={[styles.title, { color: theme.text }]}
          >
            Settings
          </Text>
          <Text
            allowFontScaling={false}
            style={[styles.subtitle, { color: theme.textSecondary }]}
          >
            Customize your app experience
          </Text>
        </View>

        <View style={styles.content}>
          <View
            style={[
              styles.section,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <View
              style={[
                styles.sectionHeader,
                { borderBottomColor: theme.border },
              ]}
            >
              <Text
                allowFontScaling={false}
                style={[styles.sectionTitle, { color: theme.text }]}
              >
                Profile
              </Text>
            </View>
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text
                  allowFontScaling={false}
                  style={[styles.settingLabel, { color: theme.text }]}
                >
                  {profileName}
                </Text>
                {createdAtLabel ? (
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.settingDescription,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {createdAtLabel}
                  </Text>
                ) : null}
              </View>
              <TouchableOpacity
                onPress={() => {
                  if (profileLoading) return;
                  if (!supabaseUser) {
                    navigation.navigate("BetLogin", {
                      returnTo: "Home",
                    });
                    return;
                  }
                  setAccountModalVisible(true);
                }}
                disabled={profileLoading}
                style={[
                  styles.profileButton,
                  {
                    backgroundColor: supabaseUser
                      ? colors.primary
                      : theme.border,
                    borderWidth: supabaseUser ? 0 : 1,
                    borderColor: supabaseUser ? null : colors.primary,
                  },
                ]}
              >
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.profileButtonText,
                    { color: supabaseUser ? "#fff" : colors.primary },
                  ]}
                >
                  {supabaseUser ? "Settings" : "Login/Create Account"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          {supabaseUser ? (
            <View
              style={[
                styles.section,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            >
              <View
                style={[
                  styles.sectionHeader,
                  { borderBottomColor: theme.border },
                ]}
              >
                <Text
                  allowFontScaling={false}
                  style={[styles.sectionTitle, { color: theme.text }]}
                >
                  SportsHeart Pro
                </Text>
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.sectionSubtitle,
                    { color: theme.textSecondary },
                  ]}
                >
                  Premium features and extras
                </Text>
              </View>

              {proActive ? (
                <View
                  style={[
                    styles.proStatusContainer,
                    { borderTopColor: theme.border },
                  ]}
                >
                  <Text
                    allowFontScaling={false}
                    style={[styles.settingLabel, { color: theme.text }]}
                  >
                    {proProductName}
                  </Text>
                  {proExpiresLabel ? (
                    <Text
                      allowFontScaling={false}
                      style={[
                        styles.settingDescription,
                        { color: theme.textSecondary, marginTop: 6 },
                      ]}
                    >
                      {proExpiresLabel}
                    </Text>
                  ) : null}
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.settingDescription,
                      { color: theme.textSecondary, marginTop: 10 },
                    ]}
                  >
                    Thank you for supporting SportsHeart ❤
                  </Text>
                </View>
              ) : (
                <>
                  <View style={styles.settingRow}>
                    <View style={styles.settingInfo}>
                      <Text
                        allowFontScaling={false}
                        style={[styles.settingLabel, { color: theme.text }]}
                      >
                        SportsHeart Pro
                      </Text>
                      <Text
                        allowFontScaling={false}
                        style={[
                          styles.settingDescription,
                          { color: theme.textSecondary },
                        ]}
                      >
                        Unlock premium features: no ads, advanced analytics, and
                        more.
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => navigation.navigate("ProSplash")}
                      style={[
                        styles.openSettingsButton,
                        { backgroundColor: colors.primary, minWidth: 100 },
                      ]}
                    >
                      <Text
                        allowFontScaling={false}
                        style={styles.openSettingsButtonText}
                      >
                        Get Pro
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <View
                    style={[
                      styles.proPromoRow,
                      { borderTopColor: theme.border },
                    ]}
                  >
                    <View style={[styles.settingRow, { padding: 2 }]}>
                      <View style={styles.settingInfo}>
                        <Text
                          allowFontScaling={false}
                          style={[styles.settingLabel, { color: theme.text }]}
                        >
                          Have a promo code?
                        </Text>
                        <Text
                          allowFontScaling={false}
                          style={[
                            styles.settingDescription,
                            { color: theme.textSecondary, marginTop: 4 },
                          ]}
                        >
                          {freePromoLabel}
                        </Text>
                        {redeemMessage ? (
                          <Text
                            allowFontScaling={false}
                            style={[
                              styles.settingDescription,
                              { color: theme.textSecondary, marginTop: 6 },
                            ]}
                          >
                            {redeemMessage}
                          </Text>
                        ) : null}
                      </View>
                      <TouchableOpacity
                        onPress={() => {
                          setRedeemMessage(null);
                          setPromoModalVisible(true);
                        }}
                        style={[
                          styles.openSettingsButton,
                          { backgroundColor: colors.primary, minWidth: 120 },
                        ]}
                      >
                        <Text
                          allowFontScaling={false}
                          style={styles.openSettingsButtonText}
                        >
                          Enter Code
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </>
              )}
            </View>
          ) : null}

          {/* Theme Toggle Section */}
          <View
            style={[
              styles.section,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <View
              style={[
                styles.sectionHeader,
                { borderBottomColor: theme.border },
              ]}
            >
              <Text
                allowFontScaling={false}
                style={[styles.sectionTitle, { color: theme.text }]}
              >
                Appearance
              </Text>
            </View>

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text
                  allowFontScaling={false}
                  style={[styles.settingLabel, { color: theme.text }]}
                >
                  Dark Mode
                </Text>
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.settingDescription,
                    { color: theme.textSecondary },
                  ]}
                >
                  {isDarkMode
                    ? "Switch to light theme"
                    : "Switch to dark theme"}
                </Text>
              </View>
              <TouchableOpacity
                onPress={toggleTheme}
                style={[
                  styles.toggleButton,
                  {
                    backgroundColor: isDarkMode ? colors.primary : theme.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.toggleThumb,
                    {
                      backgroundColor: isDarkMode ? colors.accent : "#f4f3f4",
                      transform: [{ translateX: isDarkMode ? 22 : 2 }],
                    },
                  ]}
                />
              </TouchableOpacity>
            </View>

            <View
              style={[
                styles.settingRow,
                { borderTopWidth: 1, borderTopColor: theme.borderSecondary },
              ]}
            >
              <View style={styles.settingInfo}>
                <Text
                  allowFontScaling={false}
                  style={[styles.settingLabel, { color: theme.text }]}
                >
                  App Icon
                </Text>
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.settingDescription,
                    { color: theme.textSecondary },
                  ]}
                >
                  Preview:{" "}
                  {getCurrentAppIcon &&
                    getCurrentAppIcon().replace("_", " ").toUpperCase()}
                </Text>
              </View>
              <View
                style={[styles.appIconPreview, { borderColor: colors.primary }]}
              >
                <Image
                  source={getCurrentAppIconSource()}
                  style={styles.appIconImage}
                  resizeMode="contain"
                />
              </View>
            </View>
          </View>

          {/* Color Palette Section */}
          <View
            style={[
              styles.section,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <View
              style={[
                styles.sectionHeader,
                { borderBottomColor: theme.border },
              ]}
            >
              <Text
                allowFontScaling={false}
                style={[styles.sectionTitle, { color: theme.text }]}
              >
                Color Theme
              </Text>
              <Text
                allowFontScaling={false}
                style={[styles.sectionSubtitle, { color: theme.textSecondary }]}
              >
                Choose your preferred color scheme
              </Text>
            </View>

            <View style={styles.colorGrid1}>
              {Object.entries(colorPalettes).map(([key, palette]) =>
                renderColorOption(key, palette),
              )}
            </View>

            <View
              style={{
                paddingHorizontal: 16,
                paddingBottom: 12,
                marginBottom: 6,
              }}
            >
              {isPro ? (
                <TouchableOpacity
                  onPress={() => {
                    // initialize temp colors from current custom palette
                    const base = colorPalettes?.custom || {
                      primary: "#dc2626",
                      secondary: "#ef4444",
                      accent: "#f87171",
                    };
                    setCustomTempColors({
                      primary: base.primary,
                      secondary: base.secondary,
                      accent: base.accent,
                    });
                    setCustomSelectedTarget("primary");
                    setCustomModalVisible(true);
                  }}
                  style={[
                    styles.openSettingsButton,
                    { backgroundColor: colors.secondary, marginTop: 8 },
                  ]}
                >
                  <Text
                    style={styles.openSettingsButtonText}
                    allowFontScaling={false}
                  >
                    {currentColorPalette === "custom"
                      ? "Change custom colour"
                      : "Add custom colour"}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  disabled
                  style={[
                    styles.openSettingsButton,
                    {
                      backgroundColor: theme.border,
                      marginTop: 8,
                      opacity: 0.6,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.openSettingsButtonText,
                      { color: theme.text },
                    ]}
                    allowFontScaling={false}
                  >
                    Custom colours — Pro only
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Custom Color Modal */}
            <Modal
              visible={customModalVisible}
              transparent
              animationType="slide"
              onRequestClose={() => setCustomModalVisible(false)}
            >
              <View style={styles.modalOverlay}>
                <View
                  style={[
                    styles.modalContent,
                    { backgroundColor: theme.surface },
                  ]}
                >
                  <Text style={[styles.modalTitle, { color: theme.text }]}>
                    Custom Color
                  </Text>

                  {/* primary/secondary/accent blocks moved below presets */}

                  {/* Color wheel (optional). Use the actual component export and
                      pass `radius` — do NOT rely on a width/height wrapper for the
                      react-native-color-wheel component (it reads `radius`). */}
                  {ReanimatedColorPicker ? (
                    <View style={{ alignItems: "center", marginBottom: 12 }}>
                      <ReanimatedColorPicker
                        value={customTempColors[customSelectedTarget]}
                        onCompleteJS={(c) => {
                          try {
                            // c is object with hex property
                            if (c && c.hex) handleWheelColorChange(c.hex);
                          } catch (e) {}
                        }}
                        style={{ width: "100%", height: 235 }}
                        thumbSize={24}
                      >
                        {ReanimatedPanel1 ? <ReanimatedPanel1 /> : null}
                        <View style={{ marginBottom: 12 }} />
                        {ReanimatedHueSlider ? <ReanimatedHueSlider /> : null}
                      </ReanimatedColorPicker>
                    </View>
                  ) : OptionalColorWheel ? (
                    <View style={{ alignItems: "center", marginBottom: 12 }}>
                      <OptionalColorWheel
                        initialColor={customTempColors[customSelectedTarget]}
                        radius={Math.floor(wheelSize / 2)}
                        thumbSize={Math.min(60, Math.floor(wheelSize * 0.08))}
                        onColorChange={handleWheelColorChange}
                        onColorChangeComplete={handleWheelColorChange}
                      />
                    </View>
                  ) : OptionalColorPicker ? (
                    <View style={{ alignItems: "center", marginBottom: 12 }}>
                      <OptionalColorPicker
                        onColorChange={handleWheelColorChange}
                        defaultColor={customTempColors[customSelectedTarget]}
                        style={{ width: wheelSize, height: wheelSize }}
                      />
                    </View>
                  ) : null}

                  <Text
                    allowFontScaling={false}
                    style={[styles.codeLabel, { color: theme.text }]}
                  >
                    Color value (hex)
                  </Text>
                  <TextInput
                    value={customTempColors[customSelectedTarget]}
                    onChangeText={(val) => {
                      // ensure leading #
                      const v = val.startsWith("#") ? val : `#${val}`;
                      setCustomTempColors((s) => ({
                        ...s,
                        [customSelectedTarget]: v,
                      }));
                    }}
                    style={[
                      styles.codeInput,
                      { borderColor: theme.border, color: theme.text },
                    ]}
                    placeholder="#RRGGBB"
                  />

                  <View
                    style={{
                      flexDirection: "row",
                      alignSelf: "center",
                      flexWrap: "wrap",
                      marginVertical: 12,
                    }}
                  >
                    {["#ff0000", "#ff7f00", "#ffff00", "#00ff00"].map((c) => (
                      <TouchableOpacity
                        key={c}
                        onPress={() =>
                          setCustomTempColors((s) => ({
                            ...s,
                            [customSelectedTarget]: c,
                          }))
                        }
                        style={[styles.colorOption, { backgroundColor: c }]}
                      />
                    ))}
                  </View>

                  {/* Now render the three selector blocks as a horizontal row.
                      Each item is a column: color block above abbreviated label. */}
                  <View
                    style={{
                      marginBottom: 12,
                      flexDirection: "row",
                      justifyContent: "space-between",
                    }}
                  >
                    {["primary", "secondary", "accent"].map((t) => {
                      const labelMap = {
                        primary: "Pri",
                        secondary: "Sec",
                        accent: "Acc",
                      };
                      return (
                        <TouchableOpacity
                          key={t}
                          onPress={() => setCustomSelectedTarget(t)}
                          activeOpacity={0.85}
                          style={[
                            styles.customBlock,
                            {
                              // make each block a vertical column
                              flexDirection: "column",
                              alignItems: "center",
                              justifyContent: "center",
                              flex: 1,
                              marginHorizontal: 6,
                              borderColor:
                                customSelectedTarget === t
                                  ? customTempColors[t]
                                  : theme.border,
                              backgroundColor: theme.surface,
                            },
                          ]}
                        >
                          <View
                            style={[
                              styles.customBlockInner,
                              {
                                backgroundColor: customTempColors[t],
                                marginBottom: 8,
                                marginRight: 0,
                                alignSelf: "center",
                              },
                            ]}
                          />
                          <Text
                            allowFontScaling={false}
                            style={[
                              styles.customBlockText,
                              { color: theme.text, textAlign: "center" },
                            ]}
                          >
                            {labelMap[t]}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                    }}
                  >
                    <TouchableOpacity
                      style={[
                        styles.modalButton,
                        { backgroundColor: theme.border, marginRight: 12 },
                      ]}
                      onPress={() => setCustomModalVisible(false)}
                    >
                      <Text
                        style={[styles.modalButtonText, { color: theme.text }]}
                      >
                        Cancel
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.modalButton,
                        { backgroundColor: colors.secondary },
                      ]}
                      onPress={async () => {
                        // commit custom palette
                        const toSave = {
                          primary: customTempColors.primary,
                          primaryDark: customTempColors.primary + "77",
                          secondary: customTempColors.secondary,
                          accent: customTempColors.accent,
                          light: "#ccc",
                          name: "Custom",
                        };
                        try {
                          await updateCustomPalette(toSave);
                          showBannerMessage &&
                            showBannerMessage(
                              "Custom palette saved",
                              "success",
                            );
                        } catch (e) {
                          console.error(e);
                        }
                        setCustomModalVisible(false);
                      }}
                    >
                      <Text style={[styles.modalButtonText, { color: "#fff" }]}>
                        Confirm
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Modal>
          </View>

          {/* Streaming Code Section */}
          <View
            style={[
              styles.section,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <View
              style={[
                styles.sectionHeader,
                { borderBottomColor: theme.surface },
              ]}
            >
              <Text
                allowFontScaling={false}
                style={[styles.sectionTitle, { color: theme.text }]}
              >
                Special Access
              </Text>
              <Text
                allowFontScaling={false}
                style={[styles.sectionSubtitle, { color: theme.textSecondary }]}
              >
                {isStreamingUnlocked
                  ? "Streaming is currently unlocked"
                  : "Unlock special features"}
              </Text>
            </View>

            {!isStreamingUnlocked && (
              <>
                {/* The Challenge Question */}
                <View style={styles.challengeQuestion}>
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.challengeQuestionText,
                      { color: theme.text },
                    ]}
                  >
                    You're in a universe where causality flows backward, and a
                    species communicates using Fibonacci-encoded qubits. They
                    challenge you to send back the first English word whose
                    letters match the numbers 8, 5, 1, 18, 20 (one of the most
                    important organs), with A=1, B=2, ..., Z=26. What word do
                    you send?
                  </Text>
                </View>

                {/* Code Input */}
                <View style={styles.codeInputContainer}>
                  <Text
                    allowFontScaling={false}
                    style={[styles.codeLabel, { color: theme.text }]}
                  >
                    Code
                  </Text>
                  <TextInput
                    style={[
                      styles.codeInput,
                      {
                        backgroundColor: theme.surfaceSecondary,
                        borderColor: theme.border,
                        color:
                          confirmClickCount >= 3
                            ? theme.text
                            : theme.textTertiary,
                        opacity: confirmClickCount >= 3 ? 1 : 0.6,
                      },
                    ]}
                    value={streamingCode}
                    onChangeText={
                      confirmClickCount >= 3 ? setStreamingCode : undefined
                    }
                    placeholder={
                      confirmClickCount >= 3
                        ? "Enter your answer"
                        : "Coming Soon!"
                    }
                    placeholderTextColor={theme.textTertiary}
                    editable={confirmClickCount >= 3}
                    selectTextOnFocus={confirmClickCount >= 3}
                  />
                </View>

                {/* Buttons */}
                <View style={styles.streamingButtonContainer}>
                  <TouchableOpacity
                    style={[
                      styles.confirmButton,
                      { backgroundColor: colors.secondary },
                    ]}
                    onPress={handleStreamingCodeSubmit}
                  >
                    <Text
                      allowFontScaling={false}
                      style={styles.confirmButtonText}
                    >
                      Confirm
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.resetButton,
                      {
                        backgroundColor: theme.surfaceSecondary,
                        borderColor: theme.border,
                      },
                    ]}
                    onPress={handleResetStreamingAccess}
                  >
                    <Text
                      allowFontScaling={false}
                      style={[
                        styles.resetButtonTextSymbol,
                        { color: theme.text },
                      ]}
                    >
                      ⟲
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Discord Reference */}
                <Text
                  allowFontScaling={false}
                  style={[styles.discordText, { color: theme.textTertiary }]}
                >
                  Check Discord
                </Text>
              </>
            )}

            {isStreamingUnlocked && (
              <View style={styles.streamingUnlockedContainer}>
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.streamingUnlockedText,
                    { color: colors.accent },
                  ]}
                >
                  ✓ Streaming features are unlocked
                </Text>
                <TouchableOpacity
                  style={[
                    styles.resetButton,
                    {
                      backgroundColor: theme.surfaceSecondary,
                      borderColor: theme.border,
                      marginTop: 10,
                    },
                  ]}
                  onPress={handleResetStreamingAccess}
                >
                  <Text
                    allowFontScaling={false}
                    style={[styles.resetButtonText]}
                  >
                    <Text style={{ color: theme.text, fontSize: 25 }}>⟲</Text>
                    <Text style={{ color: theme.text }}> Reset Access</Text>
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Chat Settings Section */}
          {supabaseUser ? (
            <View
              style={[
                styles.section,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            >
              <View
                style={[
                  styles.sectionHeader,
                  { borderBottomColor: theme.border },
                ]}
              >
                <Text
                  allowFontScaling={false}
                  style={[styles.sectionTitle, { color: theme.text }]}
                >
                  Chat Settings
                </Text>
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.sectionSubtitle,
                    { color: theme.textSecondary },
                  ]}
                >
                  Customize your chat appearance
                </Text>
              </View>

              {/* Name Color Setting */}
              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text
                    allowFontScaling={false}
                    style={[styles.settingLabel, { color: theme.text }]}
                  >
                    Name Color
                  </Text>
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.settingDescription,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Choose your name color in chat
                  </Text>
                </View>
                <TouchableOpacity
                  style={[
                    styles.colorPreviewButton,
                    { backgroundColor: userColor },
                  ]}
                  onPress={() => setColorModalVisible(true)}
                  activeOpacity={0.7}
                >
                  <View
                    style={[styles.colorDot, { backgroundColor: userColor }]}
                  />
                </TouchableOpacity>
              </View>

              {/* Muted Users Setting */}
              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text
                    allowFontScaling={false}
                    style={[styles.settingLabel, { color: theme.text }]}
                  >
                    Muted Users
                  </Text>
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.settingDescription,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Manage users you've muted in chat
                  </Text>
                </View>
                <TouchableOpacity
                  style={[
                    styles.openSettingsButton,
                    { backgroundColor: colors.secondary },
                  ]}
                  onPress={() => navigation.navigate("MutedUsers")}
                  activeOpacity={0.7}
                >
                  <Text
                    allowFontScaling={false}
                    style={styles.openSettingsButtonText}
                  >
                    Manage
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {/* Favorites Section */}
          <View
            style={[
              styles.section,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <View
              style={[
                styles.sectionHeader,
                { borderBottomColor: theme.border },
              ]}
            >
              <Text
                allowFontScaling={false}
                style={[styles.sectionTitle, { color: theme.text }]}
              >
                Favorites
              </Text>
              <Text
                allowFontScaling={false}
                style={[styles.sectionSubtitle, { color: theme.textSecondary }]}
              >
                Manage your favorite teams
              </Text>
            </View>

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text
                  allowFontScaling={false}
                  style={[styles.settingLabel, { color: theme.text }]}
                >
                  Favorite Teams
                </Text>
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.settingDescription,
                    { color: theme.textSecondary },
                  ]}
                >
                  {getFavoriteTeams().length === 0
                    ? "No favorite teams yet"
                    : `${getFavoriteTeams().length} favorite team${
                        getFavoriteTeams().length !== 1 ? "s" : ""
                      }`}
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.openSettingsButton,
                  { backgroundColor: colors.secondary },
                ]}
                onPress={() => navigation.navigate("FavoritesManagement")}
                activeOpacity={0.7}
              >
                <Text
                  allowFontScaling={false}
                  style={styles.openSettingsButtonText}
                >
                  Open Settings
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* App Updates Section */}
          <View
            style={[
              styles.section,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <View
              style={[
                styles.sectionHeader,
                { borderBottomColor: theme.surface },
              ]}
            >
              <Text
                allowFontScaling={false}
                style={[styles.sectionTitle, { color: theme.text }]}
              >
                App Updates
              </Text>
              <Text
                allowFontScaling={false}
                style={[styles.sectionSubtitle, { color: theme.textSecondary }]}
              >
                Check for the latest version
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.updateButton,
                {
                  backgroundColor: theme.surfaceSecondary,
                  opacity: isCheckingForUpdates ? 0.6 : 1,
                },
              ]}
              onPress={handleCheckForUpdates}
              disabled={isCheckingForUpdates}
            >
              <View style={styles.updateButtonContent}>
                <Text
                  allowFontScaling={false}
                  style={[styles.updateButtonText, { color: theme.text }]}
                >
                  {isCheckingForUpdates
                    ? "Checking for Updates..."
                    : "Check for Updates"}
                </Text>
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.updateButtonSubtext,
                    { color: theme.textSecondary },
                  ]}
                >
                  {isCheckingForUpdates
                    ? "Please wait..."
                    : "Tap to check for app updates"}
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Contact Section */}
          <View
            style={[
              styles.section,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <View
              style={[
                styles.sectionHeader,
                { borderBottomColor: theme.surface },
              ]}
            >
              <Text
                allowFontScaling={false}
                style={[styles.sectionTitle, { color: theme.text }]}
              >
                Contact
              </Text>
              <Text
                allowFontScaling={false}
                style={[styles.sectionSubtitle, { color: theme.textSecondary }]}
              >
                Connect with us on social media
              </Text>
            </View>

            <View style={styles.contactRow}>
              <TouchableOpacity
                style={[
                  styles.contactButton,
                  { backgroundColor: theme.surfaceSecondary },
                ]}
                onPress={() => Linking.openURL("https://discord.gg/fGt3sMfwge")}
                activeOpacity={0.7}
              >
                <Image
                  source={require("../../assets/discord.png")}
                  style={styles.contactIcon}
                  resizeMode="contain"
                />
                <Text
                  allowFontScaling={false}
                  style={[styles.contactLabel, { color: theme.text }]}
                >
                  Discord
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.contactButton,
                  { backgroundColor: theme.surfaceSecondary },
                ]}
                onPress={() => Linking.openURL("https://x.com/sportsheart_")}
                activeOpacity={0.7}
              >
                <Image
                  source={require("../../assets/x.png")}
                  style={styles.contactIcon}
                  resizeMode="contain"
                  tintColor={theme.text}
                />
                <Text
                  allowFontScaling={false}
                  style={[styles.contactLabel, { color: theme.text }]}
                >
                  X (Twitter)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.contactButton,
                  { backgroundColor: theme.surfaceSecondary, marginBottom: 0 },
                ]}
                onPress={() =>
                  Linking.openURL("https://www.reddit.com/r/SportsHeart/")
                }
                activeOpacity={0.7}
              >
                <Image
                  source={require("../../assets/reddit.png")}
                  style={styles.contactIcon}
                  resizeMode="contain"
                />
                <Text
                  allowFontScaling={false}
                  style={[styles.contactLabel, { color: theme.text }]}
                >
                  Reddit
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {show ? (
            <View
              style={[
                styles.section,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            >
              <View
                style={[
                  styles.sectionHeader,
                  { borderBottomColor: theme.border },
                ]}
              >
                <Text
                  allowFontScaling={false}
                  style={[styles.sectionTitle, { color: theme.text }]}
                >
                  Onboarding
                </Text>
              </View>
              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text
                    allowFontScaling={false}
                    style={[styles.settingLabel, { color: theme.text }]}
                  >
                    View onboarding
                  </Text>
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.settingDescription,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Reopen the intro screens
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={handleViewOnboarding}
                  style={[
                    styles.profileButton,
                    { backgroundColor: colors.primary },
                  ]}
                >
                  <Text
                    allowFontScaling={false}
                    style={styles.profileButtonText}
                  >
                    Open
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <Modal
        visible={promoModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setPromoModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              {
                padding: 18,
                maxWidth: 420,
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
            ]}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <Text
                allowFontScaling={false}
                style={{ color: theme.text, fontWeight: "700" }}
              >
                Enter Promo Code
              </Text>
              <TouchableOpacity onPress={() => setPromoModalVisible(false)}>
                <Text
                  allowFontScaling={false}
                  style={{ color: colors.primary, fontWeight: "700" }}
                >
                  Close
                </Text>
              </TouchableOpacity>
            </View>

            <TextInput
              value={promoCodeInput}
              onChangeText={setPromoCodeInput}
              placeholder="Enter promo code"
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.promoInput,
                { borderColor: theme.border, color: theme.text },
              ]}
              autoCapitalize="none"
            />

            {redeemMessage ? (
              <Text
                allowFontScaling={false}
                style={{ color: theme.textSecondary, marginTop: 8 }}
              >
                {redeemMessage}
              </Text>
            ) : null}

            <View
              style={{
                flexDirection: "row",
                justifyContent: "flex-end",
                marginTop: 12,
              }}
            >
              <TouchableOpacity
                onPress={() => setPromoModalVisible(false)}
                style={[styles.modalButton, { backgroundColor: theme.border }]}
              >
                <Text
                  allowFontScaling={false}
                  style={[styles.modalButtonText, { color: theme.text }]}
                >
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleRedeemPromo}
                disabled={redeemLoading}
                style={[
                  styles.modalButton,
                  {
                    backgroundColor: colors.primary,
                    marginLeft: 10,
                    opacity: redeemLoading ? 0.7 : 1,
                  },
                ]}
              >
                {redeemLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text
                    allowFontScaling={false}
                    style={[styles.modalButtonText, { color: "#fff" }]}
                  >
                    Redeem
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={accountModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setAccountModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              {
                padding: 18,
                maxWidth: 420,
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
            ]}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <Text
                allowFontScaling={false}
                style={{ color: theme.text, fontWeight: "700" }}
              >
                Account Settings
              </Text>
              <TouchableOpacity onPress={() => setAccountModalVisible(false)}>
                <Text
                  allowFontScaling={false}
                  style={{ color: colors.primary, fontWeight: "700" }}
                >
                  Close
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={() => {
                setAccountModalVisible(false);
                setChangeUsernameVisible(true);
              }}
              style={[
                styles.openSettingsButton,
                { backgroundColor: colors.primary, marginBottom: 10 },
              ]}
            >
              <Text
                allowFontScaling={false}
                style={styles.openSettingsButtonText}
              >
                Change Username
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setAccountModalVisible(false);
                setChangePasswordVisible(true);
              }}
              style={[
                styles.openSettingsButton,
                { backgroundColor: colors.primary, marginBottom: 10 },
              ]}
            >
              <Text
                allowFontScaling={false}
                style={styles.openSettingsButtonText}
              >
                Change Password
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setAccountModalVisible(false);
                handleAppLogout();
              }}
              style={[
                styles.openSettingsButton,
                { backgroundColor: "#b91c1c" },
              ]}
            >
              <Text
                allowFontScaling={false}
                style={styles.openSettingsButtonText}
              >
                Logout
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={changeUsernameVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setChangeUsernameVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              {
                padding: 18,
                maxWidth: 420,
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
            ]}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <Text
                allowFontScaling={false}
                style={{ color: theme.text, fontWeight: "700" }}
              >
                Change Username
              </Text>
              <TouchableOpacity onPress={() => setChangeUsernameVisible(false)}>
                <Text
                  allowFontScaling={false}
                  style={{ color: colors.primary, fontWeight: "700" }}
                >
                  Close
                </Text>
              </TouchableOpacity>
            </View>

            <TextInput
              value={accountCurrentPassword}
              onChangeText={setAccountCurrentPassword}
              placeholder="Current password"
              placeholderTextColor={theme.textSecondary}
              secureTextEntry
              style={[
                styles.promoInput,
                {
                  borderColor: theme.border,
                  color: theme.text,
                  marginBottom: 10,
                },
              ]}
            />
            <TextInput
              value={newUsername}
              onChangeText={setNewUsername}
              placeholder="New username"
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.promoInput,
                {
                  borderColor: theme.border,
                  color: theme.text,
                  marginBottom: 10,
                },
              ]}
              autoCapitalize="none"
            />
            <TextInput
              value={confirmUsername}
              onChangeText={setConfirmUsername}
              placeholder="Confirm new username"
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.promoInput,
                { borderColor: theme.border, color: theme.text },
              ]}
              autoCapitalize="none"
            />

            <View
              style={{
                flexDirection: "row",
                justifyContent: "flex-end",
                marginTop: 12,
              }}
            >
              <TouchableOpacity
                onPress={() => setChangeUsernameVisible(false)}
                style={[styles.modalButton, { backgroundColor: theme.border }]}
                disabled={accountActionLoading}
              >
                <Text
                  allowFontScaling={false}
                  style={[styles.modalButtonText, { color: theme.text }]}
                >
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleChangeUsernameSubmit}
                disabled={accountActionLoading}
                style={[
                  styles.modalButton,
                  {
                    backgroundColor: colors.primary,
                    marginLeft: 10,
                    opacity: accountActionLoading ? 0.7 : 1,
                  },
                ]}
              >
                {accountActionLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text
                    allowFontScaling={false}
                    style={[styles.modalButtonText, { color: "#fff" }]}
                  >
                    Update
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={changePasswordVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setChangePasswordVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              {
                padding: 18,
                maxWidth: 420,
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
            ]}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <Text
                allowFontScaling={false}
                style={{ color: theme.text, fontWeight: "700" }}
              >
                Change Password
              </Text>
              <TouchableOpacity onPress={() => setChangePasswordVisible(false)}>
                <Text
                  allowFontScaling={false}
                  style={{ color: colors.primary, fontWeight: "700" }}
                >
                  Close
                </Text>
              </TouchableOpacity>
            </View>

            <TextInput
              value={accountCurrentPassword}
              onChangeText={setAccountCurrentPassword}
              placeholder="Current password"
              placeholderTextColor={theme.textSecondary}
              secureTextEntry
              style={[
                styles.promoInput,
                {
                  borderColor: theme.border,
                  color: theme.text,
                  marginBottom: 10,
                },
              ]}
            />
            <TextInput
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="New password"
              placeholderTextColor={theme.textSecondary}
              secureTextEntry
              style={[
                styles.promoInput,
                {
                  borderColor: theme.border,
                  color: theme.text,
                  marginBottom: 10,
                },
              ]}
            />
            <TextInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm new password"
              placeholderTextColor={theme.textSecondary}
              secureTextEntry
              style={[
                styles.promoInput,
                { borderColor: theme.border, color: theme.text },
              ]}
            />

            <View
              style={{
                flexDirection: "row",
                justifyContent: "flex-end",
                marginTop: 12,
              }}
            >
              <TouchableOpacity
                onPress={() => setChangePasswordVisible(false)}
                style={[styles.modalButton, { backgroundColor: theme.border }]}
                disabled={accountActionLoading}
              >
                <Text
                  allowFontScaling={false}
                  style={[styles.modalButtonText, { color: theme.text }]}
                >
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleChangePasswordSubmit}
                disabled={accountActionLoading}
                style={[
                  styles.modalButton,
                  {
                    backgroundColor: colors.primary,
                    marginLeft: 10,
                    opacity: accountActionLoading ? 0.7 : 1,
                  },
                ]}
              >
                {accountActionLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text
                    allowFontScaling={false}
                    style={[styles.modalButtonText, { color: "#fff" }]}
                  >
                    Update
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Username Edit Modal */}
      <Modal
        visible={isEditingUsername}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsEditingUsername(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[styles.modalContent, { backgroundColor: theme.surface }]}
          >
            <Text
              allowFontScaling={false}
              style={[styles.modalTitle, { color: theme.text }]}
            >
              Edit Username
            </Text>

            <TextInput
              style={[
                styles.usernameInput,
                {
                  backgroundColor: theme.background,
                  color: theme.text,
                  borderColor: theme.border,
                },
              ]}
              value={tempUsername}
              onChangeText={setTempUsername}
              placeholder="Enter username"
              placeholderTextColor={theme.textSecondary}
              maxLength={20}
              autoFocus={true}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: theme.border }]}
                onPress={() => setIsEditingUsername(false)}
              >
                <Text
                  allowFontScaling={false}
                  style={[styles.modalButtonText, { color: theme.text }]}
                >
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalButton,
                  { backgroundColor: colors.primary },
                ]}
                onPress={() => {
                  if (tempUsername.trim()) {
                    handleUsernameChange(tempUsername.trim());
                  }
                  setIsEditingUsername(false);
                }}
              >
                <Text
                  allowFontScaling={false}
                  style={[styles.modalButtonText, { color: "#fff" }]}
                >
                  Save
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Color Selection Modal */}
      <Modal
        visible={colorModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setColorModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[styles.modalContent, { backgroundColor: theme.surface }]}
          >
            <Text
              allowFontScaling={false}
              style={[styles.modalTitle, { color: theme.text }]}
            >
              Choose Name Color
            </Text>

            <View style={styles.colorGrid}>
              {nameColors.map((color, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.colorOption,
                    {
                      backgroundColor: color,
                      borderColor: userColor === color ? "#fff" : "transparent",
                      borderWidth: userColor === color ? 3 : 0,
                    },
                  ]}
                  onPress={() => {
                    updateUserColor(color);
                    setColorModalVisible(false);
                  }}
                >
                  {userColor === color && (
                    <Text
                      allowFontScaling={false}
                      style={styles.selectedColorCheck}
                    >
                      ✓
                    </Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[
                styles.colorModalCloseButton,
                { backgroundColor: theme.border, alignSelf: "center" },
              ]}
              onPress={() => setColorModalVisible(false)}
            >
              <Text
                allowFontScaling={false}
                style={[styles.modalButtonText, { color: theme.text }]}
              >
                Close
              </Text>
            </TouchableOpacity>
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
  title: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    textAlign: "center",
  },
  content: {
    padding: 16,
  },
  section: {
    marginBottom: 20,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  sectionHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0, 0, 0, 0.1)",
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
  },
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
  },
  settingInfo: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 14,
  },
  proStatusContainer: {
    padding: 12,
    borderTopWidth: 1,
  },
  proPromoRow: {
    padding: 12,
    borderTopWidth: 1,
  },
  proPromoActionRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  promoInput: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  restrictionMessage: {
    fontSize: 12,
    marginTop: 4,
    fontStyle: "italic",
  },
  colorGrid1: {
    padding: 16,
  },
  colorOption1: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    marginBottom: 12,
    borderRadius: 8,
    position: "relative",
  },
  colorPreview: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  colorInfo: {
    flex: 1,
  },
  colorName: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  colorSwatch: {
    flexDirection: "row",
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 4,
  },
  selectedIndicator: {
    position: "absolute",
    right: 12,
    top: 12,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  checkmark: {
    color: "white",
    fontSize: 14,
    fontWeight: "bold",
  },
  previewCard: {
    margin: 16,
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
  },
  previewHeader: {
    padding: 12,
    alignItems: "center",
  },
  previewHeaderText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  previewContent: {
    padding: 16,
  },
  previewTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 8,
  },
  previewText: {
    fontSize: 14,
    marginBottom: 16,
    lineHeight: 20,
  },
  previewButton: {
    padding: 12,
    borderRadius: 6,
    alignItems: "center",
  },
  previewButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  openSettingsButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  openSettingsButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  profileButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 90,
  },
  profileButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  colorPreviewButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 12,
    padding: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 20,
  },
  usernameInput: {
    height: 50,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 15,
    fontSize: 16,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    marginBottom: 20,
  },
  colorOption: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    margin: 8,
  },

  customBlock: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    borderWidth: 2,
    marginBottom: 10,
    // box shadow on iOS/Android will be slight; keep subtle
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  customBlockInner: {
    width: 36,
    height: 36,
    borderRadius: 8,
    marginRight: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  customBlockText: {
    fontSize: 16,
    fontWeight: "600",
  },

  /* Close button in color modal should be compact and centered */
  colorModalCloseButton: {
    height: 44,
    minWidth: 120,
    paddingHorizontal: 18,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  selectedColorCheck: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
  },
  appIconPreview: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 2,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  appIconImage: {
    width: 40,
    height: 40,
  },
  // Streaming Code Styles
  bannerContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingVertical: 12,
    paddingHorizontal: 20,
    zIndex: 1000,
    alignItems: "center",
    justifyContent: "center",
  },
  bannerText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
  },
  challengeQuestion: {
    marginBottom: 16,
    padding: 16,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    marginHorizontal: 12,
  },
  challengeQuestionText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "justify",
  },
  codeInputContainer: {
    marginBottom: 16,
    marginHorizontal: 12,
  },
  codeLabel: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 8,
  },
  codeInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  streamingButtonContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    marginHorizontal: 12,
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    marginRight: 10,
  },
  confirmButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  resetButton: {
    paddingHorizontal: 5,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 45,
  },
  resetButtonTextSymbol: {
    fontSize: 35,
    fontWeight: "bold",
  },
  resetButtonText: {
    fontSize: 16,
    fontWeight: "bold",
  },
  discordText: {
    fontSize: 14,
    textAlign: "center",
    fontStyle: "italic",
    marginBottom: 16,
  },
  streamingUnlockedContainer: {
    alignItems: "center",
    padding: 16,
  },
  streamingUnlockedText: {
    marginTop: -6,
    fontSize: 16,
    fontWeight: "bold",
  },
  contactRow: {
    flexDirection: "column",
    justifyContent: "space-around",
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  contactButton: {
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    minWidth: 120,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    marginBottom: 12,
  },
  contactIcon: {
    width: 35,
    height: 35,
    marginRight: 25,
  },
  contactLabel: {
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
  },
  updateButton: {
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 8,
    marginBottom: 20,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
  },
  updateButtonContent: {
    alignItems: "center",
  },
  updateButtonText: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  updateButtonSubtext: {
    fontSize: 12,
  },
  toggleButton: {
    width: 50,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    padding: 2,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  debugSection: {
    padding: 16,
    marginBottom: 20,
  },
  debugText: {
    fontSize: 10,
    fontFamily: "monospace",
    lineHeight: 12,
  },
});

export default SettingsScreen;

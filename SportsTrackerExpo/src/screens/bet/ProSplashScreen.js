import React, { useEffect, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../../context/ThemeContext";
import { supabase } from "../../config/supabase";
import { useBetSlip } from "../../context/BetSlipContext";
import { getUserProfile } from "../../services/betService";
import {
  initPurchases,
  getOfferings,
  restorePurchases,
} from "../../services/revenuecat";

const PRO_SPLASH_KEY = "@pro_splash_seen";
const REVENUECAT_TEST_KEY = "test_zIyIvYPWDDodfFczflsLbJvDfLt";

const ProSplashScreen = ({ navigation }) => {
  const { theme, colors } = useTheme();
  const { isPro, setIsPro } = useBetSlip();
  const [monthlyPackage, setMonthlyPackage] = useState(null);
  const [yearlyPackage, setYearlyPackage] = useState(null);
  const [lifetimePackage, setLifetimePackage] = useState(null);
  const [purchasesAvailable, setPurchasesAvailable] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isLoadingPurchases, setIsLoadingPurchases] = useState(true);
  const [supabaseUserId, setSupabaseUserId] = useState(null);
  const [proStatusLabel, setProStatusLabel] = useState(null);

  const handleDismiss = async () => {
    try {
      await AsyncStorage.setItem(PRO_SPLASH_KEY, "1");
    } catch (e) {}
    navigation.replace("Home");
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (mounted && user?.id) setSupabaseUserId(user.id);
      } catch (e) {}
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (isPro) {
          if (mounted) {
            setPurchasesAvailable(false);
            setIsLoadingPurchases(false);
            setProStatusLabel("You already have SportsHeart Pro.");
          }
          return;
        }

        const initRes = await initPurchases(
          REVENUECAT_TEST_KEY,
          supabaseUserId,
        );
        if (!initRes || !initRes.ok) {
          if (mounted) {
            setPurchasesAvailable(false);
            setIsLoadingPurchases(false);
            if (initRes?.expoGo) {
              setProStatusLabel(
                "Purchases are unavailable in Expo Go. Use a dev build to test billing.",
              );
            }
          }
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 1200));

        let offerings = await getOfferings();
        if (!offerings) {
          await new Promise((resolve) => setTimeout(resolve, 1200));
          offerings = await getOfferings();
        }

        if (offerings) {
          const preferredOffering =
            (offerings.all && offerings.all["com.sportsheart.pro"]) ||
            offerings.current ||
            null;
          const pkgs =
            (preferredOffering && preferredOffering.availablePackages) || [];
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

            const hasPrice = [monthly, yearly, lifetime].some(
              (pkg) => pkg?.product?.priceString || pkg?.product?.price,
            );
            setPurchasesAvailable(!!hasPrice);
            if (!hasPrice) {
              setProStatusLabel("Store pricing is unavailable in this build.");
            }
          }
        } else if (mounted) {
          setPurchasesAvailable(false);
        }
      } catch (e) {
        if (mounted) setPurchasesAvailable(false);
      } finally {
        if (mounted) setIsLoadingPurchases(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [supabaseUserId, isPro]);

  const handleBuy = async (which) => {
    try {
      setIsPurchasing(true);
      let Purchases;
      try {
        Purchases = require("react-native-purchases").default;
      } catch (e) {
        Alert.alert(
          "Purchases not available",
          "Native Purchases SDK is not installed.",
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

      const purchaseResult = await Purchases.purchasePackage(targetPackage);
      console.log("Purchase result", purchaseResult);
      Alert.alert(
        "Purchase successful",
        "Thank you — your subscription is now active.",
      );

      try {
        const refreshed = await getUserProfile();
        if (refreshed && refreshed.success && refreshed.profile) {
          const proFlag = !!refreshed.profile.is_pro;
          try {
            await AsyncStorage.setItem("@is_pro", proFlag ? "1" : "0");
            if (setIsPro) setIsPro(proFlag);
          } catch (e) {}
          setProStatusLabel("You now have SportsHeart Pro.");
        }
      } catch (e) {}
    } catch (e) {
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
      try {
        const refreshed = await getUserProfile();
        if (refreshed && refreshed.success && refreshed.profile) {
          const proFlag = !!refreshed.profile.is_pro;
          await AsyncStorage.setItem("@is_pro", proFlag ? "1" : "0");
          if (setIsPro) setIsPro(proFlag);
          setProStatusLabel("You now have SportsHeart Pro.");
        }
      } catch (e) {}
    } catch (e) {
      Alert.alert("Restore failed", e?.message || "Unknown error");
    }
  };

  const features = [
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
      title: "Game Time Live Activity (Coming Soon)",
      desc: "Never miss a moment with live activities.",
      icon: "notifications",
      color: "#FFC107",
    },
    {
      title: "Access to SportsHeart Picks",
      desc: "Unlock the full Picks experience.",
      icon: "cash",
      color: "#4CAF50",
    },
    {
      title: "Support the Creator",
      desc: "Help keep the project growing.",
      icon: "person",
      color: "#2196F3",
    },
    {
      title: "More coming soon",
      desc: "New Pro-only features added regularly.",
      icon: "rocket",
      color: "#9C27B0",
    },
  ];

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.centerColumn}>
          <View
            style={[styles.logoCircle, { backgroundColor: colors.primary }]}
          >
            <Image
              source={require("../../../assets/33115791.png")}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
          <Text style={[styles.title, { color: theme.text }]}>
            SportsHeart Pro
          </Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Thanks for using SportsHeart! Here is what Pro includes:
          </Text>
        </View>

        <View style={styles.featureList}>
          {features.map((f) => (
            <View key={f.title} style={styles.featureRow}>
              <Ionicons
                name={f.icon}
                size={24}
                color={f.color}
                style={styles.featureIcon}
              />
              <View style={styles.featureTextWrap}>
                <Text style={[styles.featureTitle, { color: theme.text }]}>
                  {f.title}
                </Text>
                <Text
                  style={[styles.featureDesc, { color: theme.textSecondary }]}
                >
                  {f.desc}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {proStatusLabel ? (
          <Text style={[styles.proStatusText, { color: theme.textSecondary }]}>
            {proStatusLabel}
          </Text>
        ) : null}

        <View style={styles.actionBlock}>
          {isLoadingPurchases ? (
            <ActivityIndicator color={colors.primary} />
          ) : purchasesAvailable && !isPro ? (
            <View style={styles.packageRow}>
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
          ) : (
            <Text
              style={[styles.unavailableText, { color: theme.textSecondary }]}
            >
              Purchases are not available right now.
            </Text>
          )}

          <TouchableOpacity
            onPress={handleRestore}
            style={[styles.restoreButton, { borderColor: theme.border }]}
          >
            <Text style={[styles.restoreText, { color: theme.text }]}>
              Restore Purchases
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.dismissButton, { backgroundColor: colors.primary }]}
          onPress={handleDismiss}
        >
          <Text style={styles.dismissText}>Not now</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 24,
    alignItems: "center",
    flexGrow: 1,
    justifyContent: "center",
  },
  centerColumn: {
    width: "100%",
    maxWidth: 520,
    alignItems: "center",
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  logoImage: {
    width: 52,
    height: 52,
    shadowColor: "#000",
    shadowOpacity: 1,
    shadowRadius: 7.5,
    shadowOffset: { width: 0, height: 2 },
    overflow: "visible",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 6,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 20,
    maxWidth: 460,
  },
  featureList: {
    width: "100%",
    marginBottom: 24,
    maxWidth: 520,
    alignSelf: "center",
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  featureIcon: {
    marginRight: 12,
    marginTop: 2,
  },
  featureTextWrap: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  featureDesc: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  dismissButton: {
    width: "100%",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    maxWidth: 520,
    marginTop: -4,
  },
  dismissText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  actionBlock: {
    width: "100%",
    maxWidth: 520,
    alignItems: "center",
    marginBottom: 18,
  },
  packageRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
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
    fontSize: 16,
    fontWeight: "800",
    color: "#fff",
  },
  packageLabel: {
    marginTop: 6,
    fontSize: 11,
    color: "#fff",
    fontWeight: "700",
  },
  restoreButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  restoreText: {
    fontWeight: "700",
    fontSize: 12,
  },
  unavailableText: {
    fontSize: 12,
    marginBottom: 8,
  },
  proStatusText: {
    fontSize: 12,
    marginBottom: 12,
    textAlign: "center",
  },
});

export default ProSplashScreen;

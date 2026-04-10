// Lightweight RevenueCat helper with graceful fallbacks for Expo
// Uses dynamic require so app won't crash when native module missing
import { Platform } from "react-native";
import Constants from "expo-constants";
const DEFAULT_RC_KEY = "test_zIyIvYPWDDodfFczflsLbJvDfLt";

let isConfigured = false;
let configurePromise = null;

async function initPurchases(apiKey = DEFAULT_RC_KEY, appUserID = null) {
  try {
    const appOwnership = Constants.appOwnership || null;
    const executionEnvironment = Constants.executionEnvironment || null;
    const expoClient =
      Constants.manifest?.extra?.expoClient ||
      Constants.manifest2?.extra?.expoClient ||
      null;
    const isExpoGo =
      appOwnership === "expo" ||
      executionEnvironment === "storeClient" ||
      expoClient?.name === "Expo Go";

    console.log("RevenueCat init: apiKey prefix", {
      apiKeyPrefix: apiKey ? String(apiKey).slice(0, 6) : null,
      isExpoGo,
      platform: Platform.OS,
      appOwnership,
      executionEnvironment,
      expoClientName: expoClient?.name || null,
    });
    if (isConfigured) {
      return { ok: true, cached: true };
    }
    if (configurePromise) {
      return await configurePromise;
    }
    if (isExpoGo) {
      console.warn(
        "RevenueCat init skipped: native Purchases SDK unavailable in Expo Go.",
      );
      return { ok: false, expoGo: true };
    }
    if (Platform.OS === "web") {
      return { ok: false, web: true };
    }
    configurePromise = (async () => {
      const mod = require("react-native-purchases");
      const Purchases = mod && (mod.default || mod);
      if (!Purchases) {
        console.warn(
          "RevenueCat Purchases native module not found (Expo Go). Use dev-client / EAS build.",
        );
        return { ok: false, nativeMissing: true };
      }

      if (!apiKey) apiKey = DEFAULT_RC_KEY;

      // Support both `setup` and `configure` naming across versions
      if (typeof Purchases.setup === "function") {
        await Purchases.setup(apiKey);
      } else if (typeof Purchases.configure === "function") {
        await Purchases.configure({ apiKey });
      } else {
        console.warn(
          "RevenueCat Purchases SDK loaded but missing setup/configure method",
        );
        return { ok: false, missingSetup: true };
      }

      // Reduce log spam during development if supported
      try {
        if (typeof Purchases.setLogLevel === "function") {
          const { LOG_LEVEL } = require("react-native-purchases");
          if (LOG_LEVEL && LOG_LEVEL.WARN)
            Purchases.setLogLevel(LOG_LEVEL.WARN);
        }
      } catch (e) {
        // ignore
      }

      if (appUserID && typeof Purchases.identify === "function") {
        try {
          await Purchases.identify(appUserID);
        } catch (e) {
          console.warn("RevenueCat identify failed", e?.message || e);
        }
      }

      isConfigured = true;
      return { ok: true };
    })();

    const res = await configurePromise;
    configurePromise = null;
    return res;
  } catch (e) {
    console.warn(
      "RevenueCat Purchases init skipped or failed",
      e?.message || e,
    );
    configurePromise = null;
    isConfigured = false;
    return { ok: false, error: e };
  }
}

async function getOfferings() {
  try {
    const mod = require("react-native-purchases");
    const Purchases = mod && (mod.default || mod);
    if (!Purchases || typeof Purchases.getOfferings !== "function") {
      console.warn(
        "getOfferings: Purchases SDK not available or missing getOfferings",
      );
      return null;
    }
    const offerings = await Purchases.getOfferings();
    return offerings;
  } catch (e) {
    console.warn("getOfferings failed", e?.message || e);
    return null;
  }
}

async function getCustomerInfo() {
  try {
    const mod = require("react-native-purchases");
    const Purchases = mod && (mod.default || mod);
    if (!Purchases || typeof Purchases.getCustomerInfo !== "function") {
      console.warn(
        "getCustomerInfo: Purchases SDK not available or missing getCustomerInfo",
      );
      return null;
    }
    const info = await Purchases.getCustomerInfo();
    return info;
  } catch (e) {
    console.warn("getCustomerInfo failed", e?.message || e);
    return null;
  }
}

function isEntitled(customerInfo, entitlementKey = "SportsHeart Pro") {
  try {
    if (!customerInfo || !customerInfo.entitlements) return false;
    const ent = customerInfo.entitlements.active || {};
    const keys = Array.isArray(entitlementKey)
      ? entitlementKey
      : [entitlementKey];
    return keys.some((key) => !!ent[key]);
  } catch (e) {
    return false;
  }
}

async function purchasePackage(pkg) {
  try {
    const mod = require("react-native-purchases");
    const Purchases = mod && (mod.default || mod);
    if (!Purchases || typeof Purchases.purchasePackage !== "function") {
      throw new Error("purchasePackage: Purchases SDK not available");
    }
    const result = await Purchases.purchasePackage(pkg);
    return result;
  } catch (e) {
    console.warn("purchasePackage failed", e?.message || e);
    throw e;
  }
}

async function restorePurchases() {
  try {
    const mod = require("react-native-purchases");
    const Purchases = mod && (mod.default || mod);
    if (!Purchases) {
      throw new Error("restorePurchases: Purchases SDK not available");
    }
    // Support older/newer SDK names
    const restoreFn =
      typeof Purchases.restoreTransactions === "function"
        ? Purchases.restoreTransactions
        : typeof Purchases.restorePurchases === "function"
          ? Purchases.restorePurchases
          : null;
    if (!restoreFn) {
      throw new Error("restorePurchases: Purchases SDK missing restore method");
    }
    const res = await restoreFn.call(Purchases);
    return res;
  } catch (e) {
    console.warn("restorePurchases failed", e?.message || e);
    throw e;
  }
}

async function presentPaywall() {
  try {
    const UI = require("react-native-purchases-ui").default;
    const result = await UI.presentPaywall();
    return result;
  } catch (e) {
    console.warn("presentPaywall failed or not available", e?.message || e);
    return null;
  }
}

export {
  initPurchases,
  getOfferings,
  getCustomerInfo,
  isEntitled,
  purchasePackage,
  restorePurchases,
  presentPaywall,
};

export default {
  initPurchases,
  getOfferings,
  getCustomerInfo,
  isEntitled,
  purchasePackage,
  restorePurchases,
  presentPaywall,
};

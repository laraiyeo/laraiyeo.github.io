import React from "react";
import { View, Platform, NativeModules } from "react-native";
import { useTheme } from "../context/ThemeContext";
import Constants from "expo-constants";

// Do not import `react-native-google-mobile-ads` at the top-level because
// that causes failures on web and in Expo Go where the native module is not
// available. We'll `require` it dynamically at runtime and fall back to
// no-op behaviour when unavailable.
let _adsModule = null;
function ensureAdsModule() {
  if (_adsModule !== null) return _adsModule;
  // Avoid requiring the native package in environments where the native
  // module cannot exist (web, Expo Go without native build). Check
  // `NativeModules` for the presence of the underlying native module
  // before attempting to require. This prevents TurboModuleRegistry errors.
  if (Platform.OS === "web") {
    _adsModule = null;
    return null;
  }

  const { theme } = useTheme();

  const nativePresent = Boolean(
    NativeModules &&
      (NativeModules.RNGoogleMobileAdsModule ||
        NativeModules.GoogleMobileAdsModule ||
        NativeModules.RNGoogleMobileAds)
  );

  if (!nativePresent) {
    _adsModule = null;
    return null;
  }

  try {
    // require at runtime so bundlers won't eagerly include native-only code
    // on web/expo-go. Only do this if native module was detected above.
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    const mod = require("react-native-google-mobile-ads");
    _adsModule = mod && mod.__esModule ? mod.default || mod : mod;
    _adsModule.named = mod; // keep named exports accessible (BannerAd, BannerAdSize, etc)
    return _adsModule;
  } catch (e) {
    _adsModule = null;
    return null;
  }
}

/**
 * ============================
 * AdMob IDs (yours, intact)
 * ============================
 */

// Google-provided TEST ad unit IDs (safe for development)
export const DEV_BANNER_ID = "ca-app-pub-3940256099942544/6300978111";
export const DEV_INTERSTITIAL_ID = "ca-app-pub-3940256099942544/1033173712";

// Your AdMob APP ID (⚠️ not used in JS — keep exported if you need it elsewhere)
export const PROD_APP_ID = "ca-app-pub-5256386471137141~8370359232";

// Your REAL production ad unit IDs
export const PROD_BANNER_ID = "ca-app-pub-5256386471137141/1278337275";
// (add when ready)
// export const PROD_INTERSTITIAL_ID = 'ca-app-pub-XXXX/YYYY';

/**
 * ============================
 * Initialization
 * ============================
 * Call ONCE (usually in App.js)
 */
export async function initAds() {
  const mod = ensureAdsModule();
  if (!mod) {
    console.warn(
      "Ads not available in this runtime (web/Expo Go). Skipping init."
    );
    return false;
  }

  try {
    await (mod && mod() && mod().initialize
      ? mod().initialize()
      : Promise.resolve());
    return true;
  } catch (e) {
    console.warn("Ads initialization failed", e);
    return false;
  }
}

/**
 * ============================
 * Banner Ad Component
 * ============================
 */
export function BannerAdWrapper({
  unitId = PROD_BANNER_ID,
  size = "ANCHORED_ADAPTIVE_BANNER",
  requestOptions = { requestNonPersonalizedAdsOnly: true },
  theme,
}) {
  // Do not attempt to render native ads on web or when module is unavailable
  if (Platform.OS === "web") return null;
  const mod = ensureAdsModule();
  if (!mod) return null;

  // Prefer an explicit `theme` prop; otherwise read from ThemeContext hook.
  const themeContext = useTheme();
  const resolvedTheme = theme || (themeContext && themeContext.theme) || {};

  const named = mod.named || {};
  const BannerAd = named.BannerAd;
  const BannerAdSize = named.BannerAdSize || {};

  const adUnitId = __DEV__ ? DEV_BANNER_ID : unitId;

  // Resolve size: allow callers to pass a string key or a numeric size value
  let resolvedSize = size;
  if (typeof size === "string" && BannerAdSize[size])
    resolvedSize = BannerAdSize[size];
  if (!resolvedSize && BannerAdSize.ANCHORED_ADAPTIVE_BANNER)
    resolvedSize = BannerAdSize.ANCHORED_ADAPTIVE_BANNER;

  if (!BannerAd) return null;

  return (
    <View>
      <BannerAd
        unitId={adUnitId}
        size={resolvedSize}
        requestOptions={requestOptions}
        style={{ backgroundColor: resolvedTheme.surface || "#000" }}
      />
    </View>
  );
}

/**
 * ============================
 * Interstitial Helper
 * ============================
 */
export function createInterstitial(unitId) {
  const mod = ensureAdsModule();
  const named = mod ? mod.named || {} : {};
  const InterstitialAd = named.InterstitialAd;
  const AdEventType = named.AdEventType || {};

  const adUnitId = __DEV__ ? DEV_INTERSTITIAL_ID : unitId;

  if (!InterstitialAd) {
    // no-op fallback so callers don't crash in Expo Go / web
    console.warn(
      "createInterstitial: InterstitialAd not available in this runtime"
    );
    return {
      load: () => Promise.resolve(false),
      show: () => Promise.resolve(false),
      onLoaded: () => () => {},
      onClosed: () => () => {},
      _raw: null,
    };
  }

  const interstitial = InterstitialAd.createForAdRequest(adUnitId);

  return {
    load: () => interstitial.load(),
    show: () => interstitial.show(),
    onLoaded: (cb) => interstitial.addAdEventListener(AdEventType.LOADED, cb),
    onClosed: (cb) => interstitial.addAdEventListener(AdEventType.CLOSED, cb),
    _raw: interstitial,
  };
}

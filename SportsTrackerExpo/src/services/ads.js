import React from 'react';
import { View } from 'react-native';
import mobileAds, {
  BannerAd,
  BannerAdSize,
  InterstitialAd,
  AdEventType,
  TestIds,
} from 'react-native-google-mobile-ads';

/**
 * ============================
 * AdMob IDs (yours, intact)
 * ============================
 */

// Google-provided TEST ad unit IDs (safe for development)
export const DEV_BANNER_ID = 'ca-app-pub-3940256099942544/6300978111';
export const DEV_INTERSTITIAL_ID = 'ca-app-pub-3940256099942544/1033173712';

// Your AdMob APP ID (⚠️ not used in JS — keep exported if you need it elsewhere)
export const PROD_APP_ID = 'ca-app-pub-5256386471137141~8370359232';

// Your REAL production ad unit IDs
export const PROD_BANNER_ID = 'ca-app-pub-5256386471137141/1278337275';
// (add when ready)
// export const PROD_INTERSTITIAL_ID = 'ca-app-pub-XXXX/YYYY';

/**
 * ============================
 * Initialization
 * ============================
 * Call ONCE (usually in App.js)
 */
export async function initAds() {
  try {
    await mobileAds().initialize();
    return true;
  } catch (e) {
    console.warn('Ads initialization failed', e);
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
  size = BannerAdSize.ANCHORED_ADAPTIVE_BANNER,
  requestOptions = { requestNonPersonalizedAdsOnly: true },
}) {
  const adUnitId = __DEV__ ? DEV_BANNER_ID : unitId;

  return (
    <View>
      <BannerAd
        unitId={adUnitId}
        size={size}
        requestOptions={requestOptions}
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
  const adUnitId = __DEV__ ? DEV_INTERSTITIAL_ID : unitId;

  const interstitial = InterstitialAd.createForAdRequest(adUnitId);

  return {
    load: () => interstitial.load(),
    show: () => interstitial.show(),
    onLoaded: (cb) =>
      interstitial.addAdEventListener(AdEventType.LOADED, cb),
    onClosed: (cb) =>
      interstitial.addAdEventListener(AdEventType.CLOSED, cb),
    _raw: interstitial,
  };
}

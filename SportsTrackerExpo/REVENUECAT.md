RevenueCat Integration Guide for SportsHeart (Expo)

Summary
- Goal: Add subscriptions and entitlements (SportsHeart Pro) to the SportsHeart Expo app using RevenueCat.
- Coverage: install, initialization, checking entitlements, purchase & restore flows, paywall, Customer Center, product/offering setup in RevenueCat, App Store Connect / Google Play notes, testing, and best practices.

1) Install (Expo / npx)

Run in your app folder:

```bash
npx expo install react-native-purchases react-native-purchases-ui
# (optional) install expo-dev-client if you don't already use a dev client
npx expo install expo-dev-client
```

Why: `react-native-purchases` contains native code; with Expo you must use a dev-client or EAS builds. The Paywall UI (`react-native-purchases-ui`) is optional but recommended for RevenueCat-hosted paywalls.

Docs: https://www.revenuecat.com/docs/getting-started/installation/expo#install-revenuecats-sdks

2) Native build & dev-client (required)
- For local development using Purchases you'll need either:
  - an Expo dev client (recommended during development), or
  - an EAS build for production / internal testing.

Quick dev-client steps (one-time):

```bash
# 1) Install expo-dev-client if not present
npx expo install expo-dev-client
# 2) Create a dev build (iOS / Android)
# Android example
eas build --profile development --platform android
# iOS example (requires macOS / Apple signing)
eas build --profile development --platform ios
# Run the dev client on device/emulator
npx expo start --dev-client
```

3) RevenueCat API key (provided)
- Use the test key you provided for development: `test_zIyIvYPWDDodfFczflsLbJvDfLt`
- Keep production keys secret and only use server-side where required.

4) App configuration - Product IDs & Entitlements
- In App Store Connect / Google Play create these product IDs (example naming):
  - com.sportsheart.pro.monthly (consumable: subscription monthly)
  - com.sportsheart.pro.yearly  (subscription yearly)
  - com.sportsheart.pro.lifetime (non-renewing or one-time; if using non-subscription lifetime, handle as an entitlement in RevenueCat)

- On RevenueCat dashboard:
  1. Create an Entitlement: `SportsHeart Pro` (this is the entitlement key you will check in-app)
  2. Create an Offering (e.g. `default`) with packages mapping to the above product identifiers (monthly/yearly/lifetime). Use the RevenueCat UI to map App Store / Play product IDs into packages.
  3. Create Offerings if you want multiple named groups (e.g. `holiday_promo`).

Naming: Entitlement key is case-sensitive when used in code. Use `SportsHeart Pro` or `sportsheart_pro` consistently.

5) Code examples (complete)

- Lightweight helper (we added `src/services/revenuecat.js`) which centralizes init, offerings, customer info, entitlement check, purchase, restore, and paywall. Example usage below.

App initialization (in `App.js`)

```javascript
import { initPurchases, getCustomerInfo, isEntitled } from './src/services/revenuecat';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './src/config/supabase';

useEffect(() => {
  (async () => {
    // Get supabase user id if signed in (optional but recommended)
    let userId = null;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) userId = user.id;
    } catch (e) {}

    await initPurchases('test_zIyIvYPWDDodfFczflsLbJvDfLt', userId);

    const info = await getCustomerInfo();
    const entitled = isEntitled(info, 'SportsHeart Pro');
    if (entitled) await AsyncStorage.setItem('@is_pro', '1');
    else await AsyncStorage.removeItem('@is_pro');
  })();
}, []);
```

- Presenting a paywall using `react-native-purchases-ui` helper (server-configured paywalls):

```javascript
import { presentPaywall } from './src/services/revenuecat';

const showPaywall = async () => {
  const result = await presentPaywall();
  // handle PAYWALL_RESULT.PURCHASED / RESTORED / CANCELLED / ERROR
  if (result === 'PURCHASED' || result === 'RESTORED') {
    // refresh entitlements
  }
};
```

- Purchase flow (manual using offering packages)

```javascript
import { getOfferings, purchasePackage, restorePurchases, getCustomerInfo } from './src/services/revenuecat';

// fetch offerings
const offerings = await getOfferings();
const pkg = offerings?.current?.availablePackages?.[0];
if (pkg) {
  try {
    const res = await purchasePackage(pkg);
    // res contains purchaserInfo / customerInfo
    const info = await getCustomerInfo();
    const isPro = info && info.entitlements && info.entitlements.active['SportsHeart Pro'];
    // update local storage / server user metadata with isPro
  } catch (e) {
    // handle user cancelled or error
  }
}

// restore
await restorePurchases();
```

6) Entitlement checking (in-app)

Preferred runtime pattern is to listen for customerInfo updates and persist entitlement state centrally (context or AsyncStorage) for quick checks.

```javascript
import Purchases from 'react-native-purchases';

useEffect(() => {
  const listener = Purchases.addCustomerInfoUpdateListener(async (info) => {
    const pro = info?.entitlements?.active?.['SportsHeart Pro'];
    if (pro) await AsyncStorage.setItem('@is_pro','1');
    else await AsyncStorage.removeItem('@is_pro');
  });
  return () => listener?.remove?.();
}, []);
```

7) Paywall & RevenueCat UI
- You can build your own UI or use RevenueCat-hosted paywalls with `react-native-purchases-ui`.
- To present a paywall configured in RevenueCat:

```javascript
import RevenueCatUI from 'react-native-purchases-ui';
const result = await RevenueCatUI.presentPaywall();
// check PAYWALL_RESULT
```

8) Customer Center
- Customer Center is a hosted portal RevenueCat provides. To add support:
  - In the RevenueCat dashboard enable Customer Center and configure a redirect where needed.
  - Present the Customer Center link to users (RevenueCat provides a link for a specific user) or integrate via server-side REST API to retrieve a token.

9) Server-side verification & best practices
- Do NOT trust client entitlements for critical server-side features. Use RevenueCat REST API server-side to verify customer status if your backend needs to unlock server actions.
  - Create a RevenueCat API key (server-side key) from the dashboard (REST key). Keep it secret.
  - Call GET `/v1/subscribers/{appUserID}` to retrieve purchaser info server-side and validate entitlements.

- Map your Supabase user id to RevenueCat `appUserID` by calling `Purchases.identify(appUserID)` after login. This lets RevenueCat associate purchases with your Supabase user.

- Persist a minimal `@is_pro` flag locally for fast checks; still validate with server for critical enforcement.

10) App Store Connect / Google Play console steps (high level)

App Store Connect (iOS)
- Create an App record if not already present.
- In "Features" -> Subscriptions, create a subscription group and add subscription products:
  - Product ID: `com.sportsheart.pro.monthly` (Duration: 1 month)
  - Product ID: `com.sportsheart.pro.yearly` (Duration: 1 year)
  - For lifetime: create a non-consumable in-app purchase or handle it via RevenueCat's promotional entitlements.
- Add localization, price, and sandbox testers (create test Apple IDs for sandbox testing)
- In RevenueCat: add the same product IDs to the project and map them into entitlements & offerings.

Google Play (Android)
- Create in-app products (subscriptions & one-time) in Play Console with the same product IDs.
- Add license testers for sandbox testing.
- Map the Play product IDs in RevenueCat offerings.

11) Testing (Sandbox)
- iOS: use Sandbox Testers and install the dev-client build on device. Sign in with a Sandbox Apple ID before testing purchases.
- Android: use internal test track and license testers.
- RevenueCat helps to centralize purchaserInfo; verify entitlements using the RevenueCat dashboard and `getCustomerInfo()` in-app.

12) Handling errors & edge cases
- Purchases may be cancelled by the user — treat cancellations as normal flow. Only grant entitlement after confirmation from `getCustomerInfo()` or `purchaseResult`.
- Network failures: retry fetching customer info and show a friendly error.
- Multiple devices: identify users on login using `Purchases.identify(appUserID)` so purchases follow the Supabase user across devices.
- Migration: if users previously had purchases without appUserID mapping, RevenueCat supports aliasing/identifying to merge data.

13) Logging & privacy
- Use verbose logs during development: `Purchases.setLogLevel(LOG_LEVEL.DEBUG)` but remove verbose logging in production.
- Respect user privacy: don't send PII to RevenueCat beyond `appUserID` (which can be your Supabase id). Document in your privacy policy.

14) Additional tips
- Lifetime products: RevenueCat treats non-renewing purchases differently; you can model lifetime as a one-time product that grants an entitlement permanently in RevenueCat.
- Use Offerings in RevenueCat to swap pricing or run promotions without changing app code.
- Consider using the RevenueCat webhook to notify your server when subscription status changes (e.g., cancellations, renewals) so you can update backend records.

15) Useful docs & links
- RevenueCat Expo docs: https://www.revenuecat.com/docs/getting-started/installation/expo
- Paywalls: https://www.revenuecat.com/docs/tools/paywalls
- Customer Center: https://www.revenuecat.com/docs/tools/customer-center
- REST API: https://www.revenuecat.com/docs/api

---

If you want, I can now:
- Add App Store Connect product IDs to the app config and sample `.env` with `REVENUECAT_API_KEY`.
- Add a small server example (Node/Express) showing how to call RevenueCat REST API to validate a Supabase user's entitlement.
- Build a dev-client EAS profile suggestion for `eas.json` to streamline dev builds.

Files created/changed:
- `src/services/revenuecat.js` (helper)
- `src/screens/bet/BetSettingsScreen.js` (Get Pro UI + handlers)
- `App.js` updated to init Purchases and persist `@is_pro`
- `REVENUECAT.md` (this file)
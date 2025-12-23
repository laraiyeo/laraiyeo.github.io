import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Call this after user login/startup to register for push and send token to server
export async function registerForPushNotificationsAsync(serverUrl, authToken) {
  if (!Device.isDevice) {
    console.warn("Must use physical device for push notifications");
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.warn("Permission for push notifications not granted");
    return null;
  }

  const tokenResp = await Notifications.getExpoPushTokenAsync();
  console.log("getExpoPushTokenAsync response:", tokenResp);
  const expoPushToken = tokenResp?.data || tokenResp?.data?.token || tokenResp || null;
  console.log("Resolved expoPushToken:", expoPushToken);

  try {
    const res = await fetch(`${serverUrl.replace(/\/+$/, "")}/api/profile/push-token`, { // Fixed the regex
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`, // This part should work correctly now
      },
      body: JSON.stringify({
        pushToken: expoPushToken,
        platform: Device.osName || "unknown",
      }),
    });

    const text = await res.text();
    console.log("Push token upsert HTTP status:", res.status, "response:", text);

    // Persist a short record so standalone builds can surface registration status
    try {
      await AsyncStorage.setItem(
        "@last_push_registration",
        JSON.stringify({ token: expoPushToken, status: res.status, response: text, ts: new Date().toISOString() })
      );
    } catch (e) {
      console.warn("Failed to persist push registration result", e?.message || e);
    }

    if (!res.ok) console.warn("Push token upsert failed", res.status, text);
  } catch (e) {
    console.error("Failed to send push token to server", e?.message || e);

    // Handle the error and store it in AsyncStorage
    try {
      await AsyncStorage.setItem(
        "@last_push_registration",
        JSON.stringify({ token: expoPushToken, error: e?.message || String(e), ts: new Date().toISOString() })
      );
    } catch (e2) {
      console.warn("Failed to persist push registration error", e2?.message || e2);
    }
  }

  return expoPushToken;
}

// Optional: handle notification response (tapping)
export function setupNotificationResponseHandler(navigation) {
  Notifications.addNotificationResponseReceivedListener((response) => {
    // Navigate to Bet Login screen when notification tapped
    try {
      if (navigation && navigation.navigate) {
        navigation.navigate("BetLogin");
      }
    } catch (e) {
      console.error("Notification response handler error", e);
    }
  });
}

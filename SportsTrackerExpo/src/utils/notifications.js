import * as Notifications from "expo-notifications";
import * as Device from "expo-device";

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
  const expoPushToken = tokenResp.data;

  // Send to server to upsert into push_tokens
  try {
    await fetch(`${serverUrl.replace(/\/+$/, "")}/api/profile/push-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        pushToken: expoPushToken,
        platform: Device.osName || "unknown",
      }),
    });
  } catch (e) {
    console.error("Failed to send push token to server", e);
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

import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const API_URL =
  "https://laraiyeogithubio-production-f5af.up.railway.app/api";

// Helper: append a small debug entry to persistent push debug log
const PUSH_DEBUG_KEY = "@push_debug_log";
async function appendPushDebug(entry) {
  try {
    const raw = await AsyncStorage.getItem(PUSH_DEBUG_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    arr.push({ ts: new Date().toISOString(), ...entry });
    // keep only recent 200 entries
    const pruned = arr.slice(-200);
    await AsyncStorage.setItem(PUSH_DEBUG_KEY, JSON.stringify(pruned));
  } catch (e) {
    console.warn("Failed to append push debug entry", e?.message || e);
  }
}

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// If `serverAuthToken` is provided we use it when upserting the push token
export const registerForPushNotifications = async (serverAuthToken = null) => {
  let token;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF231F7C",
    });
  }

  if (Device.isDevice) {
    // Read and log current permissions for diagnostics
    const currentPerm = await Notifications.getPermissionsAsync();
    console.log("Current notification permissions:", currentPerm);
    await appendPushDebug({ type: "permissions_current", value: currentPerm });

    // Normalize check: some SDKs/platforms include `granted` boolean, others use `status` string
    const isGranted = !!(
      currentPerm?.granted ||
      currentPerm?.status === "granted" ||
      currentPerm?.ios?.status === "granted"
    );

    let finalPerm = currentPerm;
    if (!isGranted) {
      // Request permissions with explicit iOS options to be explicit in standalone builds
      const requested = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      });
      console.log("Requested notification permissions:", requested);
      await appendPushDebug({
        type: "permissions_requested",
        value: requested,
      });
      finalPerm = requested;
    }

    const finalGranted = !!(
      finalPerm?.granted ||
      finalPerm?.status === "granted" ||
      finalPerm?.ios?.status === "granted"
    );

    if (!finalGranted) {
      console.warn("Push notifications permission not granted:", finalPerm);
      await appendPushDebug({ type: "permission_denied", value: finalPerm });
      try {
        await AsyncStorage.setItem(
          "@last_push_registration",
          JSON.stringify({
            token: null,
            status: "permission_denied",
            response: finalPerm,
            ts: new Date().toISOString(),
          })
        );
      } catch (e) {
        console.warn(
          "Failed to persist permission denial info",
          e?.message || e
        );
      }
      return;
    }

    try {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      const tokenResp = await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : {}
      );
      // tokenResp shape can vary across SDKs; log entire response for diagnostics
      console.log("getExpoPushTokenAsync response:", tokenResp);
      await appendPushDebug({ type: "token_response_raw", value: tokenResp });
      token = tokenResp?.data || tokenResp?.data?.token || tokenResp || null;
      console.log("Resolved push token:", token);
      // Persist initial token result so standalone builds can surface it
      try {
        await AsyncStorage.setItem(
          "@last_push_registration",
          JSON.stringify({
            token: token || null,
            status: null,
            response: tokenResp || null,
            ts: new Date().toISOString(),
          })
        );
        await appendPushDebug({
          type: "token_persisted_initial",
          value: { token: token || null, resp: tokenResp },
        });
      } catch (e) {
        console.warn(
          "Failed to persist initial push registration",
          e?.message || e
        );
      }
    } catch (e) {
      console.error("Failed to get Expo push token:", e?.message || e);
      await appendPushDebug({
        type: "token_error",
        value: { message: e?.message || String(e) },
      });
      throw e;
    }

    // Save token to backend (POST to profile upsert endpoint)
    try {
      const authToken =
        serverAuthToken || (await AsyncStorage.getItem("@bet_token"));
      if (authToken) {
        console.log("Registering push token with server (upsert)");
        const res = await fetch(`${API_URL}/profile/push-token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            pushToken: token,
            platform: Device.osName || null,
          }),
        });
        const text = await res.text();
        console.log("Push token upsert HTTP status:", res.status);
        await appendPushDebug({
          type: "upsert_response_raw",
          value: { status: res.status, response: text },
        });
        // Persist final upsert result for debug UI
        try {
          await AsyncStorage.setItem(
            "@last_push_registration",
            JSON.stringify({
              token: token || null,
              status: res.status,
              response: text,
              ts: new Date().toISOString(),
            })
          );
          await appendPushDebug({
            type: "upsert_persisted",
            value: { status: res.status, response: text },
          });
        } catch (e) {
          console.warn("Failed to persist push upsert result", e?.message || e);
        }
        if (!res.ok) {
          console.warn("Push token upsert responded with", res.status, text);
          await appendPushDebug({
            type: "upsert_failed",
            value: { status: res.status, response: text },
          });
        } else {
          console.log("Push token upsert success", text);
          await appendPushDebug({ type: "upsert_success", value: text });
        }
      } else {
        console.debug("No auth token available; skipping push token upsert");
      }
    } catch (error) {
      console.error("Error saving push token:", error?.message || error);
      await appendPushDebug({
        type: "upsert_exception",
        value: { message: error?.message || String(error) },
      });
      try {
        await AsyncStorage.setItem(
          "@last_push_registration",
          JSON.stringify({
            token: token || null,
            error: error?.message || String(error),
            ts: new Date().toISOString(),
          })
        );
        await appendPushDebug({
          type: "upsert_exception_persisted",
          value: { message: error?.message || String(error) },
        });
      } catch (e2) {
        console.warn(
          "Failed to persist push registration error",
          e2?.message || e2
        );
      }
    }
  } else {
  }

  return token;
};

export const scheduleNotification = async (title, body, data, seconds = 1) => {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      sound: true,
    },
    trigger: { seconds },
  });
};

export const addNotificationResponseListener = (callback) => {
  return Notifications.addNotificationResponseReceivedListener(callback);
};

export const addNotificationReceivedListener = (callback) => {
  return Notifications.addNotificationReceivedListener(callback);
};

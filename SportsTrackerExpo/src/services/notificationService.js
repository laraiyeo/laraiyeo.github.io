import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const API_URL =
  "https://laraiyeogithubio-production-f5af.up.railway.app/api";

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
    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      alert("Failed to get push token for push notification!");
      return;
    }

    try {
      const tokenResp = await Notifications.getExpoPushTokenAsync(
        // projectId optional for newer SDKs; include if available
        Constants.expoConfig?.extra?.eas?.projectId
          ? { projectId: Constants.expoConfig.extra.eas.projectId }
          : {}
      );
      token = tokenResp?.data || tokenResp?.data?.token || tokenResp || null;
      console.log("Push token:", token);
    } catch (e) {
      console.error("Failed to get Expo push token:", e);
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
        if (!res.ok) {
          console.warn("Push token upsert responded with", res.status, text);
        } else {
          console.log("Push token upsert success", text);
        }
      } else {
        console.debug("No auth token available; skipping push token upsert");
      }
    } catch (error) {
      console.error("Error saving push token:", error);
    }
  } else {
    alert("Must use physical device for Push Notifications");
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

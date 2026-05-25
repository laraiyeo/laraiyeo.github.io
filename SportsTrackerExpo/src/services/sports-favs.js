import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { MLBService } from "./MLBService";

const SPORTS_FAVS_KEY = "@sports_favs_mlb_team_ids_v1";
const SPORTS_FAVS_SUBSCRIBER_KEY = "@sports_favs_subscriber_id_v1";
const BACKEND_URL = MLBService.BASE_BACKEND;

function normalizeTeamId(teamId) {
  if (teamId == null) return "";
  return String(teamId).trim();
}

async function getOrCreateSubscriberId() {
  let subscriberId = await AsyncStorage.getItem(SPORTS_FAVS_SUBSCRIBER_KEY);
  if (!subscriberId) {
    subscriberId = `sf_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    await AsyncStorage.setItem(SPORTS_FAVS_SUBSCRIBER_KEY, subscriberId);
    console.log("sports-favs: created subscriberId", subscriberId);
  } else {
    console.log("sports-favs: loaded subscriberId", subscriberId);
  }
  return subscriberId;
}

async function loadFavoriteTeamIds() {
  try {
    const raw = await AsyncStorage.getItem(SPORTS_FAVS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((id) => normalizeTeamId(id)).filter(Boolean);
  } catch {
    return [];
  }
}

async function saveFavoriteTeamIds(teamIds) {
  const cleaned = [
    ...new Set(
      (teamIds || []).map((id) => normalizeTeamId(id)).filter(Boolean),
    ),
  ];
  await AsyncStorage.setItem(SPORTS_FAVS_KEY, JSON.stringify(cleaned));
  return cleaned;
}

async function getExpoPushTokenSafe() {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF231F7C",
    });
  }

  if (!Device.isDevice) {
    console.log("sports-favs: skipping push token on non-device platform");
    return null;
  }

  const perm = await Notifications.getPermissionsAsync();
  const granted =
    perm?.granted ||
    perm?.status === "granted" ||
    perm?.ios?.status === "granted";

  let finalPerm = perm;
  if (!granted) {
    console.log("sports-favs: requesting push permissions");
    finalPerm = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
  }

  const finalGranted =
    finalPerm?.granted ||
    finalPerm?.status === "granted" ||
    finalPerm?.ios?.status === "granted";
  if (!finalGranted) {
    console.log("sports-favs: push permissions not granted", finalPerm);
    return null;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  console.log("sports-favs: requesting Expo push token", { projectId: !!projectId });
  const tokenResp = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : {},
  );
  const token = tokenResp?.data || null;
  console.log("sports-favs: got Expo push token", token ? token : "<none>");
  return token;
}

async function registerDeviceIfPossible(subscriberId) {
  try {
    const token = await getExpoPushTokenSafe();
    if (!token) {
      console.log("sports-favs: no push token available, skipping device registration", {
        subscriberId,
      });
      return null;
    }

    console.log("sports-favs: registering device", {
      subscriberId,
      pushToken: token,
      platform: Platform.OS,
    });

    await fetch(`${BACKEND_URL}/bb/notifications/register-device`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscriberId,
        pushToken: token,
        platform: Platform.OS,
      }),
    });

    console.log("sports-favs: device registration sent", {
      subscriberId,
      hasToken: !!token,
    });
    return token;
  } catch (e) {
    console.warn("sports-favs register device failed:", e?.message || e);
    return null;
  }
}

async function syncFavoriteToBackend(subscriberId, teamId, teamName, enabled) {
  try {
    console.log("sports-favs: syncing favorite to backend", {
      subscriberId,
      teamId,
      teamName,
      enabled: !!enabled,
    });
    await fetch(
      `${BACKEND_URL}/bb/notifications/favorites/${encodeURIComponent(subscriberId)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: normalizeTeamId(teamId),
          teamName: String(teamName || "").trim(),
          enabled: !!enabled,
        }),
      },
    );
    console.log("sports-favs: favorite sync complete", { subscriberId, teamId, enabled: !!enabled });
  } catch (e) {
    console.warn("sports-favs backend sync failed:", e?.message || e);
  }
}

export const sportsFavs = {
  async listFavoriteTeams() {
    return loadFavoriteTeamIds();
  },

  async isFavoriteTeam(teamId) {
    const id = normalizeTeamId(teamId);
    if (!id) return false;
    const all = await loadFavoriteTeamIds();
    return all.includes(id);
  },

  async toggleFavoriteTeam({ teamId, teamName }) {
    const id = normalizeTeamId(teamId);
    if (!id) return { isFavorite: false, favoriteTeamIds: [] };

    console.log("sports-favs: toggleFavoriteTeam start", { teamId: id, teamName });
    const subscriberId = await getOrCreateSubscriberId();
    const token = await registerDeviceIfPossible(subscriberId);
    console.log("sports-favs: toggleFavoriteTeam registration result", {
      subscriberId,
      hasToken: !!token,
    });

    const current = await loadFavoriteTeamIds();
    const has = current.includes(id);
    const next = has ? current.filter((v) => v !== id) : [...current, id];
    const saved = await saveFavoriteTeamIds(next);
    const isFavorite = !has;

    await syncFavoriteToBackend(subscriberId, id, teamName, isFavorite);

    console.log("sports-favs: toggleFavoriteTeam done", {
      subscriberId,
      teamId: id,
      isFavorite,
      favoriteCount: saved.length,
    });

    return { isFavorite, favoriteTeamIds: saved };
  },

  async ensureRegistration() {
    const subscriberId = await getOrCreateSubscriberId();
    console.log("sports-favs: ensureRegistration start", { subscriberId });
    const token = await registerDeviceIfPossible(subscriberId);
    console.log("sports-favs: ensureRegistration result", {
      subscriberId,
      hasToken: !!token,
    });
    return token;
  },
};

export default sportsFavs;

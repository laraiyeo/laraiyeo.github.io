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

  if (!Device.isDevice) return null;

  const perm = await Notifications.getPermissionsAsync();
  const granted =
    perm?.granted ||
    perm?.status === "granted" ||
    perm?.ios?.status === "granted";

  let finalPerm = perm;
  if (!granted) {
    finalPerm = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
  }

  const finalGranted =
    finalPerm?.granted ||
    finalPerm?.status === "granted" ||
    finalPerm?.ios?.status === "granted";
  if (!finalGranted) return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const tokenResp = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : {},
  );
  return tokenResp?.data || null;
}

async function registerDeviceIfPossible(subscriberId) {
  try {
    const token = await getExpoPushTokenSafe();
    if (!token) return null;

    await fetch(`${BACKEND_URL}/bb/notifications/register-device`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscriberId,
        pushToken: token,
        platform: Platform.OS,
      }),
    });

    return token;
  } catch (e) {
    console.warn("sports-favs register device failed:", e?.message || e);
    return null;
  }
}

async function syncFavoriteToBackend(subscriberId, teamId, teamName, enabled) {
  try {
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

    const subscriberId = await getOrCreateSubscriberId();
    await registerDeviceIfPossible(subscriberId);

    const current = await loadFavoriteTeamIds();
    const has = current.includes(id);
    const next = has ? current.filter((v) => v !== id) : [...current, id];
    const saved = await saveFavoriteTeamIds(next);
    const isFavorite = !has;

    await syncFavoriteToBackend(subscriberId, id, teamName, isFavorite);

    return { isFavorite, favoriteTeamIds: saved };
  },

  async ensureRegistration() {
    const subscriberId = await getOrCreateSubscriberId();
    return registerDeviceIfPossible(subscriberId);
  },
};

export default sportsFavs;

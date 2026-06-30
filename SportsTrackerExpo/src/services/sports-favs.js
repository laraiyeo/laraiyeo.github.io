import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { supabase } from "../config/supabase";
import { MLBService } from "./MLBService";
import {
  getAPITeamId,
  normalizeTeamIdForStorage,
} from "../utils/TeamIdMapping";

const SPORTS_FAVS_SUBSCRIBER_KEY = "@sports_favs_subscriber_id_v1";
const SPORTS_FAVS_PUSH_TOKEN_KEY = "@sports_favs_push_token_v1";
const FAVORITES_TABLE = "mlb_fav";
const LOCAL_FAVORITES_KEY = "favorites";
const favoriteTeamIdsCache = new Map();
const favoriteChangeListeners = new Set();
let pushTokenCache = null;
let hasRegisteredDeviceThisSession = false;
let registrationPromise = null;

function notifyFavoriteChange(payload) {
  for (const listener of favoriteChangeListeners) {
    try {
      listener?.(payload);
    } catch (e) {
      console.warn("sports-favs: listener failed", e?.message || e);
    }
  }
}

function subscribeToFavoriteChanges(listener) {
  if (typeof listener !== "function") {
    return () => {};
  }

  favoriteChangeListeners.add(listener);
  return () => favoriteChangeListeners.delete(listener);
}

function normalizeTeamId(teamId) {
  if (teamId == null) return "";
  return String(teamId).trim();
}

function normalizeFavoriteTeamIds(teamIds) {
  return [
    ...new Set(
      (teamIds || []).map((id) => normalizeTeamId(id)).filter(Boolean),
    ),
  ];
}

function resolveMlbApiTeamId(teamId) {
  const apiTeamId = getAPITeamId(teamId, "mlb");
  return String(apiTeamId || teamId || "").trim();
}

function buildLocalMlbFavorite(teamId, existingFavorite = null) {
  const apiTeamId = resolveMlbApiTeamId(teamId);
  const normalizedTeamId = normalizeTeamIdForStorage(apiTeamId, "mlb");
  const teamName =
    existingFavorite?.teamName ||
    existingFavorite?.displayName ||
    MLBService.getTeamNameById(apiTeamId) ||
    `MLB Team ${apiTeamId}`;
  const abbreviation =
    existingFavorite?.abbreviation || MLBService.getTeamAbbrById(apiTeamId) || "";

  return {
    ...(existingFavorite || {}),
    teamId: normalizedTeamId,
    id: normalizedTeamId,
    sport: "mlb",
    teamName,
    displayName: existingFavorite?.displayName || teamName,
    abbreviation,
  };
}

async function loadLocalFavorites() {
  try {
    const stored = await AsyncStorage.getItem(LOCAL_FAVORITES_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveLocalFavorites(favorites) {
  try {
    await AsyncStorage.setItem(LOCAL_FAVORITES_KEY, JSON.stringify(favorites));
  } catch (e) {
    console.warn(
      "sports-favs: failed to persist local favorites",
      e?.message || e,
    );
  }
}

async function upsertLocalMlbFavorite(teamId, existingFavorite = null) {
  const normalized = buildLocalMlbFavorite(teamId, existingFavorite);
  const localFavorites = await loadLocalFavorites();
  const nextFavorites = localFavorites.filter(
    (fav) => String(fav?.teamId || "") !== String(normalized.teamId || ""),
  );
  nextFavorites.push(normalized);
  await saveLocalFavorites(nextFavorites);
  return nextFavorites;
}

async function removeLocalMlbFavorite(teamId) {
  const normalizedTeamId = normalizeTeamIdForStorage(
    resolveMlbApiTeamId(teamId),
    "mlb",
  );
  const localFavorites = await loadLocalFavorites();
  const nextFavorites = localFavorites.filter(
    (fav) => String(fav?.teamId || "") !== String(normalizedTeamId || ""),
  );
  await saveLocalFavorites(nextFavorites);
  return nextFavorites;
}

async function clearLocalFavorites() {
  await saveLocalFavorites([]);
}

async function syncLocalMlbFavorite(teamId, existingFavorite = null) {
  const nextFavorites = await upsertLocalMlbFavorite(teamId, existingFavorite);
  notifyFavoriteChange({
    type: "upsert",
    teamId: String(teamId || ""),
    favorites: nextFavorites,
  });
  return nextFavorites;
}

async function syncLocalMlbRemoval(teamId) {
  const nextFavorites = await removeLocalMlbFavorite(teamId);
  notifyFavoriteChange({
    type: "remove",
    teamId: String(teamId || ""),
    favorites: nextFavorites,
  });
  return nextFavorites;
}

async function getCurrentSupabaseUserId() {
  try {
    const { data: { user } = {} } = await supabase.auth.getUser();
    return user?.id || null;
  } catch (e) {
    console.warn(
      "sports-favs: failed to resolve Supabase user",
      e?.message || e,
    );
    return null;
  }
}

async function getFavoriteRow(userId) {
  if (!userId) return null;

  const { data, error } = await supabase
    .from(FAVORITES_TABLE)
    .select(
      "user_id,subscriber_id,push_token,platform,favorite_team_ids,updated_at",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.warn("sports-favs: failed to load favorites row", error.message);
    return null;
  }

  return data || null;
}

async function persistFavoriteRow({
  userId,
  subscriberId,
  pushToken,
  platform,
  favoriteTeamIds,
}) {
  if (!userId) {
    throw new Error("Supabase user id is required to persist MLB favorites");
  }

  const payload = { user_id: userId };
  if (subscriberId !== undefined) {
    payload.subscriber_id = subscriberId || null;
  }
  if (pushToken !== undefined) {
    payload.push_token = pushToken || null;
  }
  if (platform !== undefined) {
    payload.platform = platform || Platform.OS || "unknown";
  }
  if (favoriteTeamIds !== undefined) {
    payload.favorite_team_ids = normalizeFavoriteTeamIds(favoriteTeamIds);
  }

  const { data, error } = await supabase
    .from(FAVORITES_TABLE)
    .upsert(payload, { onConflict: "user_id" })
    .select(
      "user_id,subscriber_id,push_token,platform,favorite_team_ids,updated_at",
    )
    .maybeSingle();

  if (error) {
    throw error;
  }

  const normalized = data || payload;
  if (Array.isArray(normalized.favorite_team_ids)) {
    favoriteTeamIdsCache.set(
      userId,
      normalizeFavoriteTeamIds(normalized.favorite_team_ids),
    );
  }
  return normalized;
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

async function loadFavoriteTeamIds({ forceRefresh = false } = {}) {
  try {
    const userId = await getCurrentSupabaseUserId();
    if (!userId) return [];

    if (!forceRefresh) {
      const cached = favoriteTeamIdsCache.get(userId);
      if (Array.isArray(cached)) return [...cached];
    }

    const row = await getFavoriteRow(userId);
    const ids = normalizeFavoriteTeamIds(row?.favorite_team_ids || []);
    favoriteTeamIdsCache.set(userId, ids);
    return [...ids];
  } catch (e) {
    console.warn(
      "sports-favs: failed to load favorite team ids",
      e?.message || e,
    );
    return [];
  }
}

async function getCachedPushToken() {
  if (pushTokenCache) return pushTokenCache;
  try {
    const cached = await AsyncStorage.getItem(SPORTS_FAVS_PUSH_TOKEN_KEY);
    const normalized = String(cached || "").trim();
    if (!normalized) return null;
    pushTokenCache = normalized;
    return normalized;
  } catch {
    return null;
  }
}

async function persistCachedPushToken(token) {
  const normalized = String(token || "").trim();
  if (!normalized) return;
  pushTokenCache = normalized;
  try {
    await AsyncStorage.setItem(SPORTS_FAVS_PUSH_TOKEN_KEY, normalized);
  } catch {
    // non-fatal cache failure
  }
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
  console.log("sports-favs: requesting Expo push token", {
    projectId: !!projectId,
  });
  const tokenResp = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : {},
  );
  const token = tokenResp?.data || null;
  await persistCachedPushToken(token);
  console.log("sports-favs: got Expo push token", token ? token : "<none>");
  return token;
}

async function registerDeviceIfPossible(subscriberId) {
  try {
    const userId = await getCurrentSupabaseUserId();
    if (!userId) {
      console.log(
        "sports-favs: no Supabase user available, skipping mlb_fav registration",
        { subscriberId },
      );
      return null;
    }

    let token = await getCachedPushToken();
    if (!token) {
      token = await getExpoPushTokenSafe();
    }
    if (!token) {
      console.log(
        "sports-favs: no push token available, skipping mlb_fav registration",
        {
          subscriberId,
          userId,
        },
      );
      return null;
    }

    const existing = await getFavoriteRow(userId);
    const alreadyRegistered =
      existing &&
      String(existing.subscriber_id || "") === String(subscriberId || "") &&
      String(existing.push_token || "") === String(token || "") &&
      String(existing.platform || "").toLowerCase() ===
        String(Platform.OS || "").toLowerCase();

    if (alreadyRegistered) {
      hasRegisteredDeviceThisSession = true;
      console.log("sports-favs: registration already up-to-date", {
        subscriberId,
        userId,
      });
      return token;
    }

    console.log("sports-favs: registering device", {
      subscriberId,
      userId,
      pushToken: token,
      platform: Platform.OS,
    });

    await persistFavoriteRow({
      userId,
      subscriberId,
      pushToken: token,
      platform: Platform.OS,
    });

    console.log("sports-favs: device registration sent", {
      subscriberId,
      userId,
      hasToken: !!token,
    });
    hasRegisteredDeviceThisSession = true;
    return token;
  } catch (e) {
    console.warn("sports-favs register device failed:", e?.message || e);
    return null;
  }
}

function maybeRegisterDeviceInBackground(subscriberId) {
  if (hasRegisteredDeviceThisSession || registrationPromise) {
    return;
  }

  registrationPromise = registerDeviceIfPossible(subscriberId)
    .then((token) => {
      console.log("sports-favs: background registration complete", {
        subscriberId,
        hasToken: !!token,
      });
      return token;
    })
    .catch((e) => {
      console.warn(
        "sports-favs: background registration failed:",
        e?.message || e,
      );
      return null;
    })
    .finally(() => {
      registrationPromise = null;
    });
}

async function syncFavoriteToSupabase(
  subscriberId,
  teamId,
  teamName,
  enabled,
  nextFavoriteTeamIds,
) {
  try {
    const userId = await getCurrentSupabaseUserId();
    if (!userId) {
      console.log(
        "sports-favs: no Supabase user available, skipping favorite sync",
        {
          subscriberId,
          teamId,
          teamName,
          enabled: !!enabled,
        },
      );
      return false;
    }

    const next = Array.isArray(nextFavoriteTeamIds)
      ? normalizeFavoriteTeamIds(nextFavoriteTeamIds)
      : enabled
        ? [
            ...(await loadFavoriteTeamIds({ forceRefresh: true })),
            normalizeTeamId(teamId),
          ]
        : (await loadFavoriteTeamIds({ forceRefresh: true })).filter(
            (value) => value !== normalizeTeamId(teamId),
          );

    console.log("sports-favs: syncing favorite to Supabase", {
      subscriberId,
      userId,
      teamId,
      teamName,
      enabled: !!enabled,
    });
    await persistFavoriteRow({
      userId,
      subscriberId,
      favoriteTeamIds: next,
    });
    console.log("sports-favs: favorite sync complete", {
      subscriberId,
      userId,
      teamId,
      enabled: !!enabled,
    });
    return true;
  } catch (e) {
    console.warn("sports-favs supabase sync failed:", e?.message || e);
    return false;
  }
}

async function removeFavoriteTeam(teamId) {
  try {
    const userId = await getCurrentSupabaseUserId();
    if (!userId) {
      await syncLocalMlbRemoval(teamId);
      console.log("sports-favs: no Supabase user available, cleared local MLB favorite only");
      return true;
    }

    const row = await getFavoriteRow(userId);
    const apiTeamId = resolveMlbApiTeamId(teamId);
    const nextIds = normalizeFavoriteTeamIds(row?.favorite_team_ids || []).filter(
      (value) => String(value) !== String(apiTeamId),
    );

    await persistFavoriteRow({
      userId,
      subscriberId: row?.subscriber_id,
      pushToken: row?.push_token,
      platform: row?.platform,
      favoriteTeamIds: nextIds,
    });
    await syncLocalMlbRemoval(teamId);

    console.log("sports-favs: favorite removed", {
      userId,
      teamId: apiTeamId,
      remainingCount: nextIds.length,
    });
    return true;
  } catch (e) {
    console.warn("sports-favs remove favorite failed:", e?.message || e);
    return false;
  }
}

async function clearFavoriteTeams() {
  try {
    const userId = await getCurrentSupabaseUserId();
    if (!userId) {
      await clearLocalFavorites();
      notifyFavoriteChange({ type: "clear", favorites: [] });
      return true;
    }

    await persistFavoriteRow({
      userId,
      favoriteTeamIds: [],
    });
    await clearLocalFavorites();
    notifyFavoriteChange({ type: "clear", favorites: [] });
    console.log("sports-favs: cleared all MLB favorites", { userId });
    return true;
  } catch (e) {
    console.warn("sports-favs clear favorites failed:", e?.message || e);
    return false;
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

    console.log("sports-favs: toggleFavoriteTeam start", {
      teamId: id,
      teamName,
    });
    const subscriberId = await getOrCreateSubscriberId();
    maybeRegisterDeviceInBackground(subscriberId);

    const current = await loadFavoriteTeamIds();
    const has = current.includes(id);
    const next = has ? current.filter((v) => v !== id) : [...current, id];
    const isFavorite = !has;

    const synced = await syncFavoriteToSupabase(
      subscriberId,
      id,
      teamName,
      isFavorite,
      next,
    );

    if (!synced) {
      const fallback = await loadFavoriteTeamIds({ forceRefresh: true });
      const fallbackIsFavorite = fallback.includes(id);
      console.warn(
        "sports-favs: toggleFavoriteTeam sync failed, using server state",
        {
          subscriberId,
          teamId: id,
          fallbackIsFavorite,
          favoriteCount: fallback.length,
        },
      );
      return {
        isFavorite: fallbackIsFavorite,
        favoriteTeamIds: fallback,
        synced: false,
      };
    }

    const userId = await getCurrentSupabaseUserId();
    if (userId) {
      favoriteTeamIdsCache.set(userId, next);
    }

    console.log("sports-favs: toggleFavoriteTeam done", {
      subscriberId,
      teamId: id,
      isFavorite,
      favoriteCount: next.length,
    });

    if (synced) {
      if (isFavorite) {
        await syncLocalMlbFavorite(id, {
          teamName,
          displayName: teamName,
        });
      } else {
        await syncLocalMlbRemoval(id);
      }
    }

    return { isFavorite, favoriteTeamIds: next, synced: true };
  },

  async removeFavoriteTeam(teamId) {
    return removeFavoriteTeam(teamId);
  },

  async clearFavoriteTeams() {
    return clearFavoriteTeams();
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

  subscribeToFavoriteChanges,
};

export default sportsFavs;

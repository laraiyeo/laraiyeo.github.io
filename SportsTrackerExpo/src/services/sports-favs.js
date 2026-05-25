import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { supabase } from "../config/supabase";

const SPORTS_FAVS_SUBSCRIBER_KEY = "@sports_favs_subscriber_id_v1";
const SPORTS_FAVS_PUSH_TOKEN_KEY = "@sports_favs_push_token_v1";
const FAVORITES_TABLE = "mlb_fav";
const favoriteTeamIdsCache = new Map();
let pushTokenCache = null;

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

  const currentRow = await getFavoriteRow(userId);
  const payload = {
    user_id: userId,
    subscriber_id: subscriberId || currentRow?.subscriber_id || null,
    push_token:
      pushToken !== undefined
        ? pushToken || null
        : currentRow?.push_token || null,
    platform: platform || currentRow?.platform || Platform.OS || "unknown",
    favorite_team_ids: normalizeFavoriteTeamIds(
      favoriteTeamIds !== undefined
        ? favoriteTeamIds
        : currentRow?.favorite_team_ids || [],
    ),
  };

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
  favoriteTeamIdsCache.set(
    userId,
    normalizeFavoriteTeamIds(normalized.favorite_team_ids),
  );
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

    const favoriteTeamIds = await loadFavoriteTeamIds();

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
      favoriteTeamIds,
    });

    console.log("sports-favs: device registration sent", {
      subscriberId,
      userId,
      hasToken: !!token,
    });
    return token;
  } catch (e) {
    console.warn("sports-favs register device failed:", e?.message || e);
    return null;
  }
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
      return;
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
  } catch (e) {
    console.warn("sports-favs supabase sync failed:", e?.message || e);
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

    const registrationPromise = registerDeviceIfPossible(subscriberId).catch(
      () => null,
    );

    const token = await Promise.race([
      registrationPromise,
      Promise.resolve(await getCachedPushToken()),
    ]);

    console.log("sports-favs: toggleFavoriteTeam registration result", {
      subscriberId,
      hasToken: !!token,
    });

    const current = await loadFavoriteTeamIds();
    const has = current.includes(id);
    const next = has ? current.filter((v) => v !== id) : [...current, id];
    const isFavorite = !has;

    await syncFavoriteToSupabase(
      subscriberId,
      id,
      teamName,
      isFavorite,
      next,
    );

    registrationPromise.then((resolvedToken) => {
      console.log("sports-favs: toggleFavoriteTeam registration async", {
        subscriberId,
        hasToken: !!resolvedToken,
      });
    });

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

    return { isFavorite, favoriteTeamIds: next };
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

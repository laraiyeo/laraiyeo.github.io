import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
  Button,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRoute } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Paths, File } from "expo-file-system";
import { MLBService } from "../src/services/MLBService";
import WBCService from "../src/services/WBCService";

let FootballLiveActivity = null;
let addPushToStartTokenListener = null;
if (Platform.OS === "ios") {
  try {
    // eslint-disable-next-line global-require
    const widgetModule = require("../widgets/FootballLiveActivity");
    FootballLiveActivity = widgetModule?.default || widgetModule;
  } catch (e) {
    FootballLiveActivity = null;
    console.warn(
      "FootballLiveActivity widget not available for MLB (native modules missing):",
      e?.message || e,
    );
  }

  try {
    // eslint-disable-next-line global-require
    addPushToStartTokenListener =
      require("expo-widgets").addPushToStartTokenListener;
  } catch (e) {
    addPushToStartTokenListener = null;
    console.warn(
      "expo-widgets push-to-start listener not available for MLB:",
      e?.message || e,
    );
  }
}

const BASEBALL_BACKEND = "https://sportsheart-baseball.up.railway.app";
const APP_BUNDLE_ID = "com.sportsheart.app";
const APP_GROUP = "group.com.sportsheart.app";
const MLB_LIVE_ACTIVITY_STATE_KEY = "@mlb_live_activity_state_v1";
const MLB_LIVE_ACTIVITY_SERVER_END_PATH = "/live-activity/update";

const logMlbActivity = (...args) => {
  console.log("[MLB Live Activity]", ...args);
};

const maskValue = (value, visibleChars = 6) => {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= visibleChars) return text;
  return `${text.slice(0, visibleChars)}…(${text.length})`;
};

const blendHexColors = (firstColor, secondColor) => {
  try {
    if (!firstColor || !secondColor) return firstColor || secondColor || null;

    const normalize = (hex) => String(hex).replace(/^#/, "");
    const parse = (hex) => {
      if (hex.length === 3) {
        return hex.split("").map((ch) => parseInt(ch + ch, 16));
      }
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
      ];
    };

    const left = parse(normalize(firstColor));
    const right = parse(normalize(secondColor));
    const toHex = (value) => value.toString(16).padStart(2, "0");

    return `#${toHex(Math.round((left[0] + right[0]) / 2))}${toHex(
      Math.round((left[1] + right[1]) / 2),
    )}${toHex(Math.round((left[2] + right[2]) / 2))}`;
  } catch {
    return firstColor || secondColor || null;
  }
};

const formatStartingAt = (dateTime) => {
  try {
    if (!dateTime) return { time: null, ampm: null, ms: null, iso: null };
    const date = new Date(dateTime);
    if (Number.isNaN(date.getTime())) {
      return { time: null, ampm: null, ms: null, iso: null };
    }

    const timeText = date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "America/New_York",
    });

    const parts = String(timeText).split(" ");
    return {
      time: parts[0] || null,
      ampm: parts[1] || null,
      ms: date.getTime(),
      iso: date.toISOString(),
    };
  } catch {
    return { time: null, ampm: null, ms: null, iso: null };
  }
};

// Update the storage functions to track by gamePk
const getStoredLiveActivityGamePk = async () => {
  try {
    const raw = await AsyncStorage.getItem(MLB_LIVE_ACTIVITY_STATE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw);
    console.log(`[MLB Live Activity] Loaded stored states:`, parsed);
    return parsed || {};
  } catch (error) {
    console.log(
      `[MLB Live Activity] Error loading stored states:`,
      error?.message,
    );
    return {};
  }
};

const setStoredLiveActivityGamePk = async (gamePk, isActive = true) => {
  try {
    const current = await getStoredLiveActivityGamePk();
    const gameKey = String(gamePk || "");

    if (isActive && gameKey) {
      // Add/Update this specific game
      current[gameKey] = {
        gamePk: gameKey,
        updatedAt: Date.now(),
      };
    } else if (gameKey) {
      // Remove this specific game
      delete current[gameKey];
    }

    console.log(`[MLB Live Activity] Updating stored states:`, current);

    await AsyncStorage.setItem(
      MLB_LIVE_ACTIVITY_STATE_KEY,
      JSON.stringify(current),
    );
  } catch (error) {
    console.log(
      `[MLB Live Activity] Error updating stored states:`,
      error?.message,
    );
  }
};

export default function MLBLiveActivityController({
  gamePk: gamePkProp = null,
  embedded = false,
  children = null,
}) {
  const route = useRoute();
  const gamePk =
    gamePkProp || route.params?.gamePk || route.params?.fixtureId || null;
  const [liveActivityActive, setLiveActivityActive] = useState(false);
  const [activityInstance, setActivityInstance] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const pushTokenSubscriptionRef = useRef(null);
  const lastRegisteredPushTokenRef = useRef(null);
  const pushToStartSubscriptionRef = useRef(null);
  const lastRegisteredPushToStartTokenRef = useRef(null);

  // Replace the syncLiveActivityState function:
  const syncLiveActivityState = useCallback(async () => {
    try {
      const storedStates = await getStoredLiveActivityGamePk();
      const storedActive = !!storedStates[gamePk];
      logMlbActivity("sync state for game", {
        gamePk,
        storedActive,
        storedStatesCount: Object.keys(storedStates).length,
      });

      // Non-iOS platforms
      if (Platform.OS !== "ios" || !FootballLiveActivity?.getInstances) {
        setLiveActivityActive(storedActive);
        setActivityInstance(storedActive ? { id: `server-${gamePk}` } : null);
        return;
      }

      try {
        const instances = await FootballLiveActivity.getInstances();
        logMlbActivity("sync instances", {
          gamePk,
          count: instances?.length || 0,
          instanceIds: Array.isArray(instances)
            ? instances.map((i) => i?.id || "unknown")
            : [],
        });

        // Look for an instance specifically for this game
        let gameInstance = null;
        if (Array.isArray(instances) && instances.length > 0) {
          // First try to find by gamePk in attributes
          gameInstance = instances.find(
            (inst) => String(inst?.attributes?.gamePk) === String(gamePk),
          );
          // If not found, try to find by id containing gamePk
          if (!gameInstance) {
            gameInstance = instances.find((inst) =>
              inst?.id?.includes(String(gamePk)),
            );
          }
          // If still not found, use first instance (fallback)
          if (!gameInstance && instances.length > 0) {
            gameInstance = instances[0];
          }
        }

        // Priority order for determining active state:
        // 1. If we have a stored state, respect it (it's the source of truth)
        // 2. If no stored state but we have an instance, handle carefully
        if (storedActive) {
          setLiveActivityActive(true);
          setActivityInstance(gameInstance || { id: `server-${gamePk}` });
          return;
        }

        // If no stored state but we found an instance for this game,
        // this might be an external activity - don't automatically activate
        // unless we explicitly started it
        if (gameInstance && pendingAction !== "start" && !busy) {
          logMlbActivity("external-instance-found", {
            gamePk,
            instanceId: gameInstance.id,
          });
          // Don't automatically set as active - let user explicitly start it
          // But if it was recently started, keep it active for a short period
          const storedState = storedStates[gamePk];
          if (
            storedState &&
            storedState.updatedAt &&
            Date.now() - storedState.updatedAt < 30000
          ) {
            // 30 seconds grace period
            setLiveActivityActive(true);
            setActivityInstance(gameInstance);
          } else {
            setLiveActivityActive(false);
            setActivityInstance(null);
          }
          return;
        }

        // No stored state and no relevant instances - inactive
        setLiveActivityActive(false);
        setActivityInstance(null);
      } catch (error) {
        logMlbActivity("sync error", {
          gamePk,
          error: error?.message || String(error),
        });
        // Fallback to stored state
        setLiveActivityActive(storedActive);
        setActivityInstance(storedActive ? { id: `server-${gamePk}` } : null);
      }
    } catch (error) {
      console.error("General sync error:", error);
      setLiveActivityActive(false);
      setActivityInstance(null);
    }
  }, [gamePk, pendingAction, busy]);

  const clearAllStoredLiveActivityStates = async () => {
    try {
      await AsyncStorage.removeItem(MLB_LIVE_ACTIVITY_STATE_KEY);
      console.log(`[MLB Live Activity] Cleared all stored states`);
    } catch (error) {
      console.log(
        `[MLB Live Activity] Error clearing stored states:`,
        error?.message,
      );
    }
  };

  // Update stopLiveActivity to properly remove from storage:
  const stopLiveActivity = async () => {
    try {
      setBusy(true);
      setPendingAction("stop");

      logMlbActivity("stop:begin", { gamePk });

      // Aggressively clear this game from storage immediately
      await setStoredLiveActivityGamePk(gamePk, false);

      // Also attempt to clear from FootballLiveActivity
      if (activityInstance) {
        try {
          await activityInstance.end?.();
        } catch (e) {
          logMlbActivity("stop:instance-end-error", { error: e.message });
        }
      }

      // Send server end event
      try {
        await sendServerEndEvent();
      } catch (serverError) {
        logMlbActivity("stop:server-end-error", {
          gamePk,
          error: serverError.message,
        });
      }

      // Let's also do a full sync to remove any stale state
      await refreshLiveActivityState();

      globalThis.__sportsheartPushToStartToken = null;
      lastRegisteredPushTokenRef.current = null;
      lastRegisteredPushToStartTokenRef.current = null;

      logMlbActivity("stop:done", { gamePk });
    } catch (err) {
      console.error("Failed to stop MLB Live Activity:", err);
      logMlbActivity("stop:error", {
        gamePk,
        error: err?.message || String(err),
      });
      Alert.alert("Live Activity", `Failed to stop: ${err.message}`);
    } finally {
      setPendingAction(null);
      setBusy(false);
    }
  };

  useEffect(() => {
    if (Platform.OS !== "ios" || !FootballLiveActivity?.getInstances)
      return undefined;

    const forceSync = setInterval(async () => {
      try {
        // Skip cleanup if we're busy or in a pending action
        if (pendingAction || busy) {
          return;
        }

        const instances = await FootballLiveActivity.getInstances().catch(
          () => [],
        );
        const storedStates = await getStoredLiveActivityGamePk();

        // Only cleanup for this specific game, not all games
        if ((!instances || instances.length === 0) && storedStates[gamePk]) {
          // Check if this is really an external dismiss by waiting a bit
          // and checking again to make sure it's not a timing issue
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const instances2 = await FootballLiveActivity.getInstances().catch(
            () => [],
          );
          const storedStates2 = await getStoredLiveActivityGamePk();

          // If still no instances and we still have stored state,
          // and user didn't just start an activity, then it was externally dismissed
          if (
            (!instances2 || instances2.length === 0) &&
            storedStates2[gamePk] &&
            pendingAction !== "start"
          ) {
            logMlbActivity("external-dismiss-confirmed", {
              gamePk,
              storedState: storedStates2[gamePk],
            });
            // Only remove this specific game from stored states
            await setStoredLiveActivityGamePk(gamePk, false);
            setLiveActivityActive(false);
            setActivityInstance(null);
          }
        }
      } catch (error) {
        logMlbActivity("force-sync-error", {
          gamePk,
          error: error?.message || String(error),
        });
      }
    }, 8000); // Check every 8 seconds (longer interval)

    return () => clearInterval(forceSync);
  }, [gamePk, pendingAction, busy]);

  const downloadImageToShared = async (url, filename) => {
    if (!url || Platform.OS !== "ios") return null;

    try {
      logMlbActivity("downloadImageToShared:start", {
        gamePk,
        filename,
        url,
        appGroup: APP_GROUP,
      });
      const sharedDir = Paths.appleSharedContainers?.[APP_GROUP];
      if (!sharedDir) {
        logMlbActivity("downloadImageToShared:no-shared-dir", {
          gamePk,
          filename,
          url,
        });
        return null;
      }

      const destination = new File(sharedDir, filename);
      logMlbActivity("downloadImageToShared:destination", {
        gamePk,
        filename,
        destination: destination?.uri || null,
      });

      if (destination.exists) {
        try {
          destination.delete();
          logMlbActivity("downloadImageToShared:deleted-existing", {
            gamePk,
            filename,
          });
        } catch (deleteError) {
          logMlbActivity("downloadImageToShared:delete-existing-failed", {
            gamePk,
            filename,
            error: deleteError?.message || String(deleteError),
          });
        }
      }

      const file = await File.downloadFileAsync(url, destination, {
        idempotent: true,
      });

      logMlbActivity("downloadImageToShared:done", {
        gamePk,
        filename,
        uri: file?.uri || null,
      });
      return file.uri;
    } catch (e) {
      console.warn("MLB logo download failed:", e?.message || e);
      logMlbActivity("downloadImageToShared:error", {
        gamePk,
        filename,
        url,
        error: e?.message || String(e),
      });
      return null;
    }
  };

  const refreshLiveActivityState = useCallback(() => {
    void syncLiveActivityState();
  }, [syncLiveActivityState]);

  const sendServerEndEvent = async () => {
    if (!gamePk) return false;

    const response = await fetch(
      `${BASEBALL_BACKEND}${MLB_LIVE_ACTIVITY_SERVER_END_PATH}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gamePk, action: "end" }),
      },
    );
    const body = await response.text().catch(() => "");
    logMlbActivity("stop:server-end-response", {
      gamePk,
      status: response.status,
      ok: response.ok,
      body,
    });

    if (!response.ok) {
      throw new Error(`Server end failed with HTTP ${response.status}`);
    }

    return true;
  };

  async function registerActivityToken(pushToken, payload, source) {
    if (!pushToken) return false;

    const registerUrl = `${BASEBALL_BACKEND}/live-activity/register-activity-token`;
    logMlbActivity("register-activity-token", {
      gamePk,
      source,
      token: maskValue(pushToken),
    });

    const response = await fetch(registerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fixtureId: gamePk,
        gamePk: gamePk,
        token: pushToken,
        props: payload,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Register activity token failed with HTTP ${response.status}`,
      );
    }

    return true;
  }

  const registerPushToStartToken = async (token, source) => {
    if (!token) return false;
    const registrationKey = `${String(gamePk || "").trim()}:${token}`;
    if (lastRegisteredPushToStartTokenRef.current === registrationKey) {
      logMlbActivity("register-push-to-start:skipped-duplicate", {
        gamePk,
        source,
        token: maskValue(token),
      });
      return true;
    }

    const registerUrl = `${BASEBALL_BACKEND}/live-activity/register-push-to-start`;
    logMlbActivity("register-push-to-start:begin", {
      gamePk,
      source,
      token: maskValue(token),
      bundleId: APP_BUNDLE_ID,
      fixtureId: gamePk,
      registerUrl,
    });

    const registerResponse = await fetch(registerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bundleId: APP_BUNDLE_ID,
        fixtureId: gamePk,
        token,
      }),
    });
    const registerText = await registerResponse.text().catch(() => "");
    logMlbActivity("register-push-to-start:response", {
      gamePk,
      source,
      status: registerResponse.status,
      ok: registerResponse.ok,
      body: registerText,
    });
    if (!registerResponse.ok) {
      throw new Error(
        `Register push-to-start token failed with HTTP ${registerResponse.status}`,
      );
    }

    lastRegisteredPushToStartTokenRef.current = registrationKey;
    logMlbActivity("register-push-to-start:sent", {
      gamePk,
      source,
      token: maskValue(token),
    });
    return true;
  };

  // In the ensureServerStartedInstance function, modify the polling logic:
  const ensureServerStartedInstance = async (
    existingInstanceSnapshot = { ids: new Set(), count: 0 },
    maxAttempts = 10,
  ) => {
    try {
      // First attempt - always check current instances
      const instances = await FootballLiveActivity.getInstances().catch(
        () => [],
      );

      if (Array.isArray(instances) && instances.length > 0) {
        // Try to find our game specifically
        const gameInstance = instances.find(
          (inst) =>
            String(inst?.attributes?.gamePk) === String(gamePk) ||
            inst?.id?.includes(String(gamePk)),
        );

        if (gameInstance) {
          logMlbActivity("found native instance", {
            gamePk,
            instanceId: gameInstance.id,
            attributes: gameInstance.attributes,
          });
          return gameInstance;
        }
      }

      // If no native instances for this game, return server reference
      logMlbActivity("using server instance fallback", { gamePk });
      return { id: `server-${gamePk}` };
    } catch (error) {
      logMlbActivity("ensureServerStartedInstance:error", {
        gamePk,
        error: error?.message || String(error),
      });
      return {
        id: `server-${gamePk}`,
        type: "server",
        attributes: { gamePk: String(gamePk) },
      };
    }
  };

  const attachActivityInstance = async (instance, payload, source) => {
    try {
      // Ensure we have a proper instance object for server cases
      const properInstance = {
        id: instance?.id || instance?.toString?.() || `server-${gamePk}`,
        ...instance,
        // For server instances, we'll use a unique gamePk-based identifier
        attributes: {
          gamePk: String(gamePk),
          ...(instance?.attributes || {}),
        },
      };

      setActivityInstance(properInstance);
      await setStoredLiveActivityGamePk(gamePk, true);
      setLiveActivityActive(true);

      logMlbActivity("attach:success", {
        gamePk,
        instanceId: properInstance.id,
        source,
        type: properInstance.id === `server-${gamePk}` ? "server" : "native",
      });

      return true;
    } catch (error) {
      logMlbActivity("attach:error", {
        gamePk,
        error: error?.message || String(error),
      });
      return false;
    }
  };

  const requestServerStart = async (payload, maxAttempts = 12) => {
    const startUrl = `${BASEBALL_BACKEND}/live-activity/start`;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      logMlbActivity("start:request-server", {
        gamePk,
        startUrl,
        payloadName: payload?.home?.name || null,
        attempt,
      });

      const startResponse = await fetch(startUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bundleId: APP_BUNDLE_ID,
          fixtureId: gamePk,
          gamePk,
          props: payload,
        }),
      });
      const startText = await startResponse.text().catch(() => "");
      logMlbActivity("start:server-response", {
        gamePk,
        attempt,
        status: startResponse.status,
        ok: startResponse.ok,
        body: startText,
      });

      if (startResponse.ok) {
        return { response: startResponse, body: startText };
      }

      if (startResponse.status !== 409 || attempt === maxAttempts) {
        throw new Error(
          `Server start failed with HTTP ${startResponse.status}`,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    throw new Error("Server start failed before push-to-start token arrived");
  };

  const buildPayload = async () => {
    if (!gamePk) throw new Error("gamePk is required");

    logMlbActivity("buildPayload:start", { gamePk });

    const response = await fetch(
      `${MLBService.BASE_URL}/api/v1/schedule/games/?sportId=1&gamePk=${encodeURIComponent(String(gamePk))}&hydrate=linescore,previousPlay&fields=dates,games,gamePk,gameType,gameDate,status,codedGameState,detailedState,teams,away,team,id,name,score,isWinner,home,linescore,currentInning,currentInningOrdinal,isTopInning,defense,team,id,name,pitcher,id,fullName,offense,team,id,name,batter,id,fullName,first,second,third,balls,strikes,outs,venue,previousPlay,result,description,matchup`,
      { headers: { "Cache-Control": "no-cache", Pragma: "no-cache" } },
    );
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    const feed = await response.json();
    const games = Array.isArray(feed?.dates)
      ? feed.dates.flatMap((date) => date?.games ?? [])
      : [];
    const game =
      games.find((entry) => String(entry?.gamePk) === String(gamePk)) ?? {};
    const linescore = game?.linescore ?? {};

    const awayEntry = game?.teams?.away ?? {};
    const homeEntry = game?.teams?.home ?? {};
    const awayTeam = awayEntry?.team ?? {};
    const homeTeam = homeEntry?.team ?? {};
    const status = game?.status ?? {};
    const venue = game?.venue ?? {};
    const gameDate = game?.gameDate ?? null;

    const awayColor = MLBService.getTeamColorById(awayTeam?.id) || "#888888";
    const homeColor = MLBService.getTeamColorById(homeTeam?.id) || "#888888";
    const blendedColor = blendHexColors(homeColor, awayColor) || "#888888";

    const resolveLogoUrl = (team) =>
      MLBService.getTeamLogo(team?.id, true) ||
      WBCService.getTeamLogo(team?.id, true);

    const awayLogoUrl = resolveLogoUrl(awayTeam);
    const homeLogoUrl = resolveLogoUrl(homeTeam);

    logMlbActivity("buildPayload:resolved-team-data", {
      gamePk,
      gameDate,
      away: {
        id: awayTeam?.id ?? null,
        name: awayTeam?.name || null,
        abbr: awayTeam?.abbreviation || awayTeam?.abbr || null,
        logoUrl: awayLogoUrl,
      },
      home: {
        id: homeTeam?.id ?? null,
        name: homeTeam?.name || null,
        abbr: homeTeam?.abbreviation || homeTeam?.abbr || null,
        logoUrl: homeLogoUrl,
      },
      sameLogoUrl:
        awayLogoUrl && homeLogoUrl ? awayLogoUrl === homeLogoUrl : false,
      colors: { home: homeColor, away: awayColor, blended: blendedColor },
    });

    const [awayLogo, homeLogo] = await Promise.all([
      downloadImageToShared(awayLogoUrl, `away_${gamePk}.png`),
      downloadImageToShared(homeLogoUrl, `home_${gamePk}.png`),
    ]);

    logMlbActivity("buildPayload:download-results", {
      gamePk,
      awayLogo,
      homeLogo,
      sameUri: awayLogo && homeLogo ? awayLogo === homeLogo : false,
      filenames: {
        away: `away_${gamePk}.png`,
        home: `home_${gamePk}.png`,
      },
    });

    const awayScore = awayEntry?.score ?? awayTeam?.score ?? 0;
    const homeScore = homeEntry?.score ?? homeTeam?.score ?? 0;
    const awayWinner = awayEntry?.isWinner ?? awayTeam?.isWinner ?? false;
    const homeWinner = homeEntry?.isWinner ?? homeTeam?.isWinner ?? false;
    const previousPlay = game?.previousPlay || null;
    const previousPlayData = {
      raw: previousPlay,
      description:
        String(previousPlay?.result?.description || "").trim() || null,
      matchup: {
        batter: {
          id: previousPlay?.matchup?.batter?.id ?? null,
          fullName: previousPlay?.matchup?.batter?.fullName ?? null,
        },
        pitcher: {
          id: previousPlay?.matchup?.pitcher?.id ?? null,
          fullName: previousPlay?.matchup?.pitcher?.fullName ?? null,
        },
      },
      teamIds: {
        offense: linescore?.offense?.team?.id ?? null,
        defense: linescore?.defense?.team?.id ?? null,
      },
    };
    const base1 = !!linescore?.offense?.first?.id;
    const base2 = !!linescore?.offense?.second?.id;
    const base3 = !!linescore?.offense?.third?.id;
    const bases = {
      base1,
      base2,
      base3,
      first: base1,
      second: base2,
      third: base3,
    };
    const balls = Number(linescore?.balls ?? 0);
    const strikes = Number(linescore?.strikes ?? 0);
    const outs = Number(linescore?.outs ?? 0);
    const batter = linescore?.offense?.batter?.fullName ?? null;
    const pitcher = linescore?.defense?.pitcher?.fullName ?? null;
    const currentInningOrdinal = String(
      linescore?.currentInningOrdinal || linescore?.currentInning || "",
    );
    const statusCode = String(
      status?.codedGameState || status?.statusCode || "",
    ).toUpperCase();
    const inning = String(
      linescore?.currentInning ?? (statusCode === "F" ? 9 : null),
    );
    const inningState =
      linescore?.isTopInning === true
        ? "Top"
        : linescore?.isTopInning === false
          ? "Bottom"
          : null;

    const detailedState = String(status?.detailedState || status?.status || "");

    logMlbActivity("buildPayload:final-payload-summary", {
      gamePk,
      statusCode,
      detailedState,
      gameDate,
      inningRaw: linescore?.currentInning ?? null,
      currentInningOrdinal: currentInningOrdinal || null,
      inningDerived: inning,
      inningState,
      count: { balls, strikes, outs },
      matchup: { batter, pitcher },
      scores: { away: awayScore, home: homeScore },
      winners: { away: awayWinner, home: homeWinner },
      bases,
      logoNames: {
        away: `away_${gamePk}.png`,
        home: `home_${gamePk}.png`,
      },
    });

    return {
      gamePk,
      id: gamePk,
      sport: "mlb",
      url: `sportsheart://mlb/game/${gamePk}`,
      startingAt: formatStartingAt(gameDate),
      status: {
        short_name: statusCode || (status?.statusCode === "F" ? "F" : "S"),
        text: detailedState,
        inning,
        currentInningOrdinal,
        inningState,
        balls,
        strikes,
        outs,
        batter,
        pitcher,
        bases,
        base1,
        base2,
        base3,
        previousPlayDescription: previousPlayData.description,
        previousPlayBatterId: previousPlayData.matchup.batter.id,
        previousPlayPitcherId: previousPlayData.matchup.pitcher.id,
        offenseTeamId: previousPlayData.teamIds.offense,
        defenseTeamId: previousPlayData.teamIds.defense,
        ticking: statusCode === "I" || statusCode === "M",
      },
      bases,
      base1,
      base2,
      base3,
      previousPlay: previousPlayData.raw,
      previousPlayDescription: previousPlayData.description,
      previousPlayMatchup: previousPlayData.matchup,
      linescoreTeamIds: previousPlayData.teamIds,
      linescoreOffenseTeamId: previousPlayData.teamIds.offense,
      linescoreDefenseTeamId: previousPlayData.teamIds.defense,
      home: {
        name: homeTeam?.name || "Home",
        shortName:
          homeTeam?.abbreviation ||
          homeTeam?.shortName ||
          String(homeTeam?.name || "HOME")
            .slice(0, 3)
            .toUpperCase(),
        score: homeScore,
        winner: homeWinner,
        logo: homeLogo,
        logoName: `home_${gamePk}.png`,
      },
      away: {
        name: awayTeam?.name || "Away",
        shortName:
          awayTeam?.abbreviation ||
          awayTeam?.shortName ||
          String(awayTeam?.name || "AWAY")
            .slice(0, 3)
            .toUpperCase(),
        score: awayScore,
        winner: awayWinner,
        logo: awayLogo,
        logoName: `away_${gamePk}.png`,
      },
      league: {
        name: game?.gameType === "R" ? "MLB" : "MLB",
        logo: null,
      },
      venue: {
        name: venue?.name || "Venue",
      },
      colors: {
        home: homeColor,
        away: awayColor,
        blended: blendedColor,
      },
    };
  };

  const startLiveActivity = async () => {
    try {
      setBusy(true);
      setPendingAction("start");

      if (!FootballLiveActivity)
        throw new Error("LiveActivity factory unavailable");
      if (!gamePk) throw new Error("Missing gamePk");

      logMlbActivity("start:begin", { gamePk });

      const payload = await buildPayload();

      // Register immediately as activity token
      await setStoredLiveActivityGamePk(gamePk, true);
      logMlbActivity("start:payload-ready", {
        gamePk,
        home: {
          name: payload?.home?.name,
          logoName: payload?.home?.logoName,
          logoUri: payload?.home?.logo || null,
        },
        away: {
          name: payload?.away?.name,
          logoName: payload?.away?.logoName,
          logoUri: payload?.away?.logo || null,
        },
        status: {
          shortName: payload?.status?.short_name || null,
          text: payload?.status?.text || null,
          inning: payload?.status?.inning ?? null,
          inningState: payload?.status?.inningState ?? null,
        },
      });

      // Get the current push token immediately
      const pushToken = globalThis?.__sportsheartPushToStartToken;
      logMlbActivity("start:have-push-token", {
        gamePk,
        hasToken: !!pushToken,
        token: pushToken ? maskValue(pushToken) : null,
      });

      // If we have a push token, register it immediately as an activity token
      if (pushToken) {
        try {
          await registerActivityToken(
            pushToken,
            payload,
            "immediate-registration",
          );
          logMlbActivity("start:activity-token-registered", {
            gamePk,
            token: maskValue(pushToken),
          });
        } catch (tokenError) {
          logMlbActivity("start:activity-token-error", {
            gamePk,
            error: tokenError.message,
          });
        }
      }

      // Check for existing native instances
      let existingInstances = [];
      if (FootballLiveActivity?.getInstances) {
        try {
          existingInstances = await FootballLiveActivity.getInstances();
          logMlbActivity("start:existing-instances", {
            gamePk,
            count: existingInstances?.length || 0,
            instanceIds:
              existingInstances?.map((i) => i?.id || "unknown") || [],
          });
        } catch (error) {
          logMlbActivity("start:existing-instances-error", {
            gamePk,
            error: error?.message || String(error),
          });
          existingInstances = [];
        }
      }

      // Server start request
      const serverResult = await requestServerStart(payload);
      logMlbActivity("start:server-success", { gamePk });

      // As activity pre-registered, start polling
      setActivityInstance({ id: `server-${gamePk}`, type: "server" });
      setLiveActivityActive(true);

      // Additional token registration after server response
      if (pushToken) {
        try {
          await registerActivityToken(pushToken, payload, "server-response");
        } catch (serverTokenError) {
          logMlbActivity("start:server-token-error", {
            gamePk,
            error: serverTokenError.message,
          });
        }
      }
    } catch (err) {
      console.error("Failed to start MLB Live Activity:", err);
      logMlbActivity("start:error", {
        gamePk,
        error: err?.message || String(err),
      });
      await setStoredLiveActivityGamePk(gamePk, false);
      Alert.alert("Live Activity", `Failed to start: ${err.message}`);
    } finally {
      logMlbActivity("start:end", { gamePk });
      setPendingAction(null);
      setBusy(false);
    }
  };

  useEffect(() => {
    if (
      Platform.OS !== "ios" ||
      typeof addPushToStartTokenListener !== "function"
    ) {
      return undefined;
    }

    let cancelled = false;
    const subscription = addPushToStartTokenListener(async (event) => {
      if (cancelled) return;
      const token = event?.activityPushToStartToken;
      logMlbActivity("push-to-start:listener-event", {
        gamePk,
        hasToken: !!token,
        token: token ? maskValue(token) : null,
      });
      if (!token) return;

      try {
        await registerPushToStartToken(token, "listener");
      } catch (error) {
        logMlbActivity("push-to-start:error", {
          gamePk,
          error: error?.message || String(error),
        });
        console.warn(
          "MLB push-to-start token registration failed:",
          error?.message || error,
        );
      }
    });

    pushToStartSubscriptionRef.current = subscription || null;

    return () => {
      cancelled = true;
      try {
        subscription?.remove?.();
      } catch {
        // Ignore cleanup errors.
      }
      pushToStartSubscriptionRef.current = null;
    };
  }, [gamePk]);

  useEffect(() => {
    if (Platform.OS !== "ios") return undefined;

    const interval = setInterval(() => {
      refreshLiveActivityState();
    }, 3000);

    return () => clearInterval(interval);
  }, [refreshLiveActivityState]);

  useEffect(() => {
    if (Platform.OS !== "ios") return undefined;

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        refreshLiveActivityState();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [refreshLiveActivityState]);

  useEffect(() => {
    // Cleanup function when component unmounts
    return () => {
      if (pushTokenSubscriptionRef.current) {
        try {
          pushTokenSubscriptionRef.current.remove?.();
        } catch {
          // Ignore cleanup errors
        }
        pushTokenSubscriptionRef.current = null;
      }
      if (pushToStartSubscriptionRef.current) {
        try {
          pushToStartSubscriptionRef.current.remove?.();
        } catch {
          // Ignore cleanup errors
        }
        pushToStartSubscriptionRef.current = null;
      }
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      syncLiveActivityState();
      return undefined;
    }, [syncLiveActivityState]),
  );

  const controllerApi = {
    gamePk,
    liveActivityActive,
    busy,
    pendingAction,
    syncLiveActivityState,
    startLiveActivity,
    stopLiveActivity,
  };

  if (typeof children === "function") {
    return children(controllerApi);
  }

  if (Platform.OS !== "ios") {
    return (
      <View
        style={
          embedded ? controllerStyles.embeddedWrap : controllerStyles.backdrop
        }
      >
        <View style={[controllerStyles.card, { backgroundColor: "#fff" }]}>
          <Text style={controllerStyles.title}>MLB Live Activity</Text>
          <Text style={controllerStyles.description}>
            Live Activities are available on iOS only.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View
      style={
        embedded ? controllerStyles.embeddedWrap : controllerStyles.backdrop
      }
    >
      <View style={[controllerStyles.card, { backgroundColor: "#fff" }]}>
        <Text style={controllerStyles.title}>MLB Live Activity</Text>
        <Text style={controllerStyles.description}>
          Game ID: {gamePk || "Missing"}
        </Text>
        <Text style={controllerStyles.statusText}>
          {liveActivityActive
            ? "Live Activity is active"
            : "No active Live Activity found"}
        </Text>
        <View style={controllerStyles.buttonWrap}>
          <Button
            title={
              pendingAction === "stop"
                ? "Stopping..."
                : pendingAction === "start"
                  ? "Starting..."
                  : liveActivityActive
                    ? "Stop Live Activity"
                    : "Start Live Activity"
            }
            onPress={liveActivityActive ? stopLiveActivity : startLiveActivity}
            disabled={busy || !gamePk}
          />
        </View>
      </View>
    </View>
  );
}

const controllerStyles = StyleSheet.create({
  embeddedWrap: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.38)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 18,
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 8,
  },
  description: {
    fontSize: 13,
    textAlign: "center",
    marginBottom: 10,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 14,
  },
  buttonWrap: {
    alignSelf: "stretch",
  },
});

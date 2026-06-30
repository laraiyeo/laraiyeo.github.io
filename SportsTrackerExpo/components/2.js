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
      token: pushToken ? maskValue(pushToken) : null 
    });

    // If we have a push token, register it immediately as an activity token
    if (pushToken) {
      try {
        await registerActivityToken(pushToken, payload, "immediate-registration");
        logMlbActivity("start:activity-token-registered", { gamePk, token: maskValue(pushToken) });
      } catch (tokenError) {
        logMlbActivity("start:activity-token-error", { gamePk, error: tokenError.message });
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
          instanceIds: existingInstances?.map(i => i?.id || 'unknown') || []
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
    setActivityInstance({ id: `server-${gamePk}`, type: 'server' });
    setLiveActivityActive(true);

    // Additional token registration after server response
    if (pushToken) {
      try {
        await registerActivityToken(pushToken, payload, "server-response");
      } catch (serverTokenError) {
        logMlbActivity("start:server-token-error", { gamePk, error: serverTokenError.message });
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

// Add a new function to handle activity token registration
async function registerActivityToken(pushToken, payload, source) {
  if (!pushToken) return false;
  
  const registerUrl = `${BASEBALL_BACKEND}/live-activity/register-activity-token`;
  logMlbActivity("register-activity-token", {
    gamePk,
    source,
    token: maskValue(pushToken)
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
    throw new Error(`Register activity token failed with HTTP ${response.status}`);
  }
  
  return true;
}
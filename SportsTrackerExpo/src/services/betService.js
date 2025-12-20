import { supabase } from "../config/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Helper: decode a JWT without external deps (returns payload object)
function decodeJwt(token) {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = parts[1];
    const padded = payload.padEnd(
      payload.length + ((4 - (payload.length % 4)) % 4),
      "="
    );
    const decoded = Buffer.from(
      padded.replace(/-/g, "+").replace(/_/g, "/"),
      "base64"
    ).toString("utf8");
    return JSON.parse(decoded);
  } catch (e) {
    return null;
  }
}

// Build normalized bets metadata used by both createBetslip and placeBet
function buildBetsMetadata(betslipData, totalStake = 0, potentialPayout = 0) {
  // Normalize bets into an array
  let bets = [];
  if (betslipData) {
    if (Array.isArray(betslipData)) bets = betslipData;
    else if (Array.isArray(betslipData.bets)) bets = betslipData.bets;
    else if (betslipData.bets) bets = [betslipData.bets];
    else if (betslipData.id || betslipData.gameId) bets = [betslipData];
  }

  const createdAt = new Date().toISOString();

  // compute total decimal odds
  const decimalOddsArr = bets.map((b) => {
    const o = parseInt(b.odds);
    if (isNaN(o)) return 1;
    return o > 0 ? o / 100 + 1 : 100 / Math.abs(o) + 1;
  });
  const totalDecimalOdds = decimalOddsArr.reduce((acc, v) => acc * v, 1);

  const firstBet = bets[0] || {};

  // Resolve betslip_url if provided
  const resolvedBetslipUrl =
    (betslipData &&
      typeof betslipData === "object" &&
      (betslipData.betslip_url ||
        (betslipData.betslipData && betslipData.betslipData.betslip_url))) ||
    null;

  const betslipObject =
    typeof betslipData === "object" ? betslipData : { bets };

  return {
    bets,
    createdAt,
    totalDecimalOdds,
    firstBet,
    resolvedBetslipUrl,
    betslipObject,
    totalStake: totalStake || 0,
    potentialPayout:
      potentialPayout || +((totalStake || 0) * totalDecimalOdds).toFixed(2),
  };
}

export const createBetslip = async (
  betslipData,
  totalStake = 0,
  potentialPayout = 0
) => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { success: false, error: "Not authenticated" };

    let serverCalled = false;
    let serverFallback = false;
    let profileId = null;
    try {
      const serverToken = await AsyncStorage.getItem("@bet_token");
      if (serverToken) {
        const p = decodeJwt(serverToken);
        if (p && p.profileId) profileId = p.profileId;
      }
    } catch (e) {}

    // Resolve username if possible
    let username = null;
    try {
      const pid = profileId || user.id;
      const { data: profileData } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", pid)
        .maybeSingle();
      if (profileData && profileData.username) username = profileData.username;
    } catch (e) {
      /* ignore */
    }

    const {
      bets,
      createdAt,
      totalDecimalOdds,
      firstBet,
      resolvedBetslipUrl,
      betslipObject,
    } = buildBetsMetadata(betslipData, totalStake, potentialPayout);

    const payload = {
      user_id: profileId || user.id,
      user_username: username,
      bets: bets,
      betslip_data: betslipObject,
      betslip_url: resolvedBetslipUrl,
      total_stake: totalStake || 0,
      potential_payout:
        potentialPayout || +((totalStake || 0) * totalDecimalOdds).toFixed(2),
      total_odds: totalDecimalOdds,
      status: "pending",
      created_at: createdAt,
      game_id: firstBet.gameId || firstBet.game_id || "",
      selection: firstBet.description || firstBet.selection || null,
      amount: firstBet.amount != null ? parseFloat(firstBet.amount) : null,
      odds: firstBet.odds != null ? String(firstBet.odds) : null,
    };

    // Try atomic RPC first (ensures credits are deducted server-side)
    try {
      const rpcStake = payload.total_stake || 0;
      const rpcPotential = payload.potential_payout || null;

      // Debug: log RPC payload and context
      console.log("createBetslip: calling place_betslip RPC", {
        p_stake: rpcStake,
        p_bets: bets,
        p_potential_payout: rpcPotential,
        profileId,
        authUserId: (user && user.id) || null,
      });

      const { data: rpcData, error: rpcError } = await supabase.rpc(
        "place_betslip",
        {
          p_stake: rpcStake,
          p_bets: bets,
          p_betslip_data: betslipObject,
          p_potential_payout: rpcPotential,
          p_betslip_url: resolvedBetslipUrl,
          p_user_username: username,
        }
      );

      if (!rpcError) {
        // refresh profile to get updated credits
        try {
          const profileResp = await getUserProfile();
          const creditsRemaining =
            profileResp && profileResp.success && profileResp.profile
              ? Number(profileResp.profile.credits)
              : null;
          console.log("createBetslip: place_betslip RPC succeeded", {
            rpcData,
            creditsRemaining,
          });
          return {
            success: true,
            betslipId: rpcData || null,
            serverCalled: true,
            serverFallback: false,
            creditsRemaining,
          };
        } catch (e) {
          console.log(
            "createBetslip: place_betslip RPC succeeded (no profile)",
            { rpcData }
          );
          return {
            success: true,
            betslipId: rpcData || null,
            serverCalled: true,
            serverFallback: false,
          };
        }
      } else {
        // Detailed RPC error logging
        console.error(
          "createBetslip RPC place_betslip error:",
          JSON.stringify(rpcError, Object.getOwnPropertyNames(rpcError), 2)
        );
        // Also log error fields if available
        try {
          console.error(
            "rpcError details:",
            rpcError?.message,
            rpcError?.details,
            rpcError?.hint,
            rpcError?.code
          );
        } catch (e) {}
      }
    } catch (e) {
      console.error(
        "createBetslip: place_betslip RPC threw:",
        e?.message || e,
        e
      );
    }

    // Prefer server endpoint when server token is available
    try {
      // Prefer server-side bet token, otherwise try using Supabase session access token
      const serverToken = await AsyncStorage.getItem("@bet_token");
      let authToken = serverToken || null;
      if (!authToken) {
        try {
          const { data: { session } = {} } = await supabase.auth.getSession();
          if (session && session.access_token) authToken = session.access_token;
        } catch (e) {
          // ignore
        }
      }
      if (authToken) {
        serverCalled = true;
        const SERVER_BASE =
          "https://laraiyeogithubio-production-f5af.up.railway.app";
        const resp = await fetch(`${SERVER_BASE}/api/betslips`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            betslipData: payload.betslip_data,
            totalStake: payload.total_stake,
            potentialPayout: payload.potential_payout,
          }),
        });
        let json = null;
        try {
          json = await resp.json();
        } catch (e) {
          json = null;
        }
        if (resp.ok) {
          return {
            success: true,
            betslipId: json?.betslipId || json?.betslip_id || null,
            creditsRemaining:
              json?.creditsRemaining != null
                ? Number(json.creditsRemaining)
                : null,
            serverCalled: true,
            serverFallback: false,
          };
        } else {
          serverFallback = true;
          console.warn(
            "createBetslip: server endpoint rejected request",
            resp.status,
            json
          );
        }
      }
    } catch (e) {
      console.warn(
        "createBetslip: server endpoint call failed",
        e?.message || e
      );
    }

    // Try aggregated insert into Supabase
    try {
      const insertRes = await supabase
        .from("betslips")
        .insert(payload)
        .select("id")
        .single();
      if (!insertRes.error && insertRes.data && insertRes.data.id) {
        return {
          success: true,
          betslipId: insertRes.data.id,
          serverCalled,
          serverFallback,
        };
      }
      if (insertRes.error) {
        console.warn(
          "createBetslip: aggregated insert failed:",
          insertRes.error
        );
        serverFallback = true;
      }
    } catch (dbErr) {
      console.error(
        "createBetslip: aggregated insert exception:",
        dbErr?.message || dbErr
      );
      serverFallback = true;
    }

    // Aggregated insert failed — fallback to singlePayload insert
    const aggregatedBetslip = {
      bets,
      meta: { timestamp: createdAt, amount: totalStake || 0 },
      total_odds: totalDecimalOdds,
      total_stake: totalStake || 0,
      potential_payout:
        potentialPayout || +((totalStake || 0) * totalDecimalOdds).toFixed(2),
    };
    const first = bets[0] || {};
    const singlePayload = {
      user_id: profileId || user.id,
      user_username: username,
      bets: bets,
      betslip_data: aggregatedBetslip,
      betslip_url: resolvedBetslipUrl,
      total_stake: totalStake || 0,
      potential_payout:
        potentialPayout || +((totalStake || 0) * totalDecimalOdds).toFixed(2),
      total_odds: totalDecimalOdds,
      status: "pending",
      created_at: createdAt,
      game_id: first.gameId || first.game_id || "",
      selection: first.description || first.selection || null,
      amount: first.amount != null ? parseFloat(first.amount) : totalStake || 0,
      odds: first.odds != null ? String(first.odds) : null,
      gameId: first.gameId || first.game_id || "",
      betValue: first.betValue || first.line || null,
      description: first.description || first.selection || null,
      gameInfoTime: (first.gameInfo && first.gameInfo.time) || null,
      gameInfoTeams: (first.gameInfo && first.gameInfo.teams) || null,
      line: first.line || null,
      player: first.player || null,
      playerId: first.playerId || null,
      prop: first.prop || null,
      statType: first.statType || null,
      team: first.team || null,
      type: first.type || null,
      createdAt: createdAt,
    };

    try {
      const { data: d2, error: e2 } = await supabase
        .from("betslips")
        .insert(singlePayload)
        .select("id")
        .single();
      if (e2) {
        console.error(
          "createBetslip: fallback singlePayload insert failed:",
          e2
        );
        return {
          success: false,
          error: e2.message || String(e2),
          serverCalled,
          serverFallback: true,
        };
      }
      const id = d2 && d2.id ? d2.id : null;
      return {
        success: true,
        betslipId: id,
        serverCalled,
        serverFallback: true,
      };
    } catch (e3) {
      console.error(
        "createBetslip: fallback insert exception:",
        e3?.message || e3
      );
      return {
        success: false,
        error: e3.message || String(e3),
        serverCalled,
        serverFallback: true,
      };
    }
  } catch (error) {
    console.error("Create betslip error:", error);
    return {
      success: false,
      error: error.message || "Failed to create betslip",
    };
  }
};
/**
 * Place a bet - automatically deducts credits
 * @param {string} gameId - The game ID
 * @param {string} selection - Team/player selected
 * @param {number} amount - Amount to bet
 * @param {number} odds - Odds for the bet
 * @returns {Promise<{success: boolean, betslipId?: string, error?: string}>}
 */
export const placeBet = async (
  gameId,
  selection,
  amount,
  odds,
  betslipUrl = null,
  betRaw = null
) => {
  try {
    // Normalize and log inputs
    console.log("placeBet called with:", { gameId, selection, amount, odds });

    // Ensure we have the authenticated user for username/profile resolution
    const {
      data: { user },
    } = await supabase.auth.getUser();
    // If odds looks like American (+120/-150 or integer >=100), convert to decimal
    let oddsValue = odds;
    try {
      const parsed = parseFloat(odds);
      if (!isNaN(parsed)) {
        if (Math.abs(parsed) >= 100) {
          // treat as American
          if (parsed > 0) oddsValue = parsed / 100 + 1;
          else oddsValue = 100 / Math.abs(parsed) + 1;
        } else {
          oddsValue = parsed;
        }
      }
    } catch (e) {
      // keep original
    }

    // Build single-bet payloads so the DB function can persist full row shape
    let profileId = null;
    try {
      const serverToken = await AsyncStorage.getItem("@bet_token");
      if (serverToken) {
        const p = decodeJwt(serverToken);
        if (p && p.profileId) profileId = p.profileId;
      }
    } catch (e) {}

    // Resolve username if possible
    let username = null;
    try {
      const pid = profileId || (user && user.id);
      const { data: profileData } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", pid)
        .maybeSingle();
      if (profileData && profileData.username) username = profileData.username;
    } catch (e) {
      /* ignore */
    }

    const originalOddsRaw = odds;

    // Build a rich bet object. Prefer the provided `betRaw` (from UI) so
    // single-leg bets use the same metadata shape as multi-leg bets.
    let betObj;
    if (betRaw && typeof betRaw === "object") {
      betObj = { ...betRaw };
      // ensure amount and odds fields are present
      betObj.amount = betObj.amount != null ? betObj.amount : amount;
      if (betObj.odds == null) {
        betObj.odds =
          typeof originalOddsRaw === "string"
            ? originalOddsRaw
            : originalOddsRaw != null
            ? String(originalOddsRaw)
            : oddsValue != null
            ? String(oddsValue)
            : null;
      }
      if (!betObj.id) {
        betObj.id = `bet-${gameId}-${Math.random().toString(36).slice(2, 8)}`;
      }
    } else {
      betObj = {
        id: `bet-${gameId}-${Math.random().toString(36).slice(2, 8)}`,
        line: "",
        odds:
          typeof originalOddsRaw === "string"
            ? originalOddsRaw
            : originalOddsRaw != null
            ? String(originalOddsRaw)
            : oddsValue != null
            ? String(oddsValue)
            : null,
        team: selection,
        type:
          selection === "Over" || selection === "Under" ? "Total" : "Moneyline",
        gameId: gameId,
        gameInfo: null,
        description: selection,
        amount: amount,
      };
    }

    const singleBets = [betObj];

    // Reuse the shared builder so single-leg RPC uses identical betslip_data
    const {
      bets: _b,
      createdAt: _createdAt,
      totalDecimalOdds: _totalDecimalOdds,
      firstBet: _firstBet,
      resolvedBetslipUrl: _resolvedBetslipUrl,
      betslipObject: _betslipObject,
      totalStake: _totalStake,
      potentialPayout: _potentialPayout,
    } = buildBetsMetadata(
      { bets: singleBets },
      amount,
      +(amount * oddsValue).toFixed(2)
    );

    const singleBetslipData = _betslipObject;

    // Ensure we have a betslip URL: prefer explicit betslipUrl param, then resolved value, otherwise build a server endpoint URL
    const SERVER_BASE =
      "https://laraiyeogithubio-production-f5af.up.railway.app";
    const constructedBetslipUrl = `${SERVER_BASE}/api/betslip?gameId=${encodeURIComponent(
      String(gameId)
    )}&moneyline=${encodeURIComponent(String(selection))}`;
    const finalBetslipUrl =
      betslipUrl || _resolvedBetslipUrl || constructedBetslipUrl;
    console.log("placeBet: resolved betslip URL", {
      provided: betslipUrl,
      _resolvedBetslipUrl,
      constructedBetslipUrl,
    });

    // Call the place_bet database function (extended signature)
    const { data, error } = await supabase.rpc("place_bet", {
      p_game_id: gameId,
      p_selection: selection,
      p_amount: amount,
      p_odds: oddsValue,
      p_bets: singleBets,
      p_betslip_data: singleBetslipData,
      p_betslip_url: finalBetslipUrl,
      p_user_username: username,
      p_total_odds: oddsValue,
      p_potential_payout: singleBetslipData.potential_payout,
    });

    if (error) {
      console.error("Place bet rpc error object:", error);
      throw error;
    }

    return {
      success: true,
      betslipId: data, // Returns the UUID of the created betslip
    };
  } catch (error) {
    console.error("Place bet error:", error?.message || error, error);
    // Provide structured error details when available
    const errMsg = error?.message || error?.toString() || "Failed to place bet";
    return {
      success: false,
      error: errMsg,
      details: error?.details || null,
      hint: error?.hint || null,
    };
  }
};

/**
 * Get user's current profile (including credits)
 * @returns {Promise<{success: boolean, profile?: object, error?: string}>}
 */
export const getUserProfile = async () => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error("Not authenticated");
    }

    // Prefer profileId from server JWT if present
    let profileId = null;
    try {
      const serverToken = await AsyncStorage.getItem("@bet_token");
      if (serverToken) {
        const p = decodeJwt(serverToken);
        if (p && p.profileId) profileId = p.profileId;
      }
    } catch (e) {}

    // Try to resolve profile by profileId, then by auth user id
    let query = supabase.from("profiles").select("*").limit(1);
    if (profileId) query = query.eq("id", profileId);
    else query = query.eq("id", user.id);

    const { data, error } = await query.single();

    if (error) throw error;

    return {
      success: true,
      profile: data,
    };
  } catch (error) {
    console.error("Get profile error:", error);
    return {
      success: false,
      error: error.message || "Failed to get profile",
    };
  }
};

/**
 * Get user's betslips
 * @param {string} status - Filter by status ('pending', 'won', 'lost', or null for all)
 * @returns {Promise<{success: boolean, betslips?: array, error?: string}>}
 */
export const getUserBetslips = async (status = null) => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error("Not authenticated");
    }

    // Resolve profileId (prefer server token, then profiles table, else auth user id)
    let profileId = null;
    try {
      const serverToken = await AsyncStorage.getItem("@bet_token");
      if (serverToken) {
        const p = decodeJwt(serverToken);
        if (p && p.profileId) profileId = p.profileId;
      }
    } catch (e) {}

    if (!profileId) {
      try {
        const { data: prof } = await supabase
          .from("profiles")
          .select("id")
          .eq("id", user.id)
          .maybeSingle();
        if (prof && prof.id) profileId = prof.id;
      } catch (e) {
        /* ignore */
      }
    }

    const uid = profileId || user.id;

    let query = supabase
      .from("betslips")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) throw error;

    return {
      success: true,
      betslips: data,
    };
  } catch (error) {
    console.error("Get betslips error:", error);
    return {
      success: false,
      error: error.message || "Failed to get betslips",
    };
  }
};

/**
 * Get user's bet history
 * @returns {Promise<{success: boolean, history?: array, error?: string}>}
 */
export const getBetHistory = async () => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error("Not authenticated");
    }

    // Resolve profileId as above
    let profileId = null;
    try {
      const serverToken = await AsyncStorage.getItem("@bet_token");
      if (serverToken) {
        const p = decodeJwt(serverToken);
        if (p && p.profileId) profileId = p.profileId;
      }
    } catch (e) {}
    if (!profileId) {
      try {
        const { data: prof } = await supabase
          .from("profiles")
          .select("id")
          .eq("id", user.id)
          .maybeSingle();
        if (prof && prof.id) profileId = prof.id;
      } catch (e) {}
    }
    const uid = profileId || user.id;

    const { data, error } = await supabase
      .from("bet_history")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return {
      success: true,
      history: data,
    };
  } catch (error) {
    console.error("Get bet history error:", error);
    return {
      success: false,
      error: error.message || "Failed to get bet history",
    };
  }
};

/**
 * Create a betslip record for the authenticated user
 * Attempts an aggregated insert (single row with `betslip_data`), falls back
 * to per-bet rows using a shared `created_at` timestamp. Returns {success, betslipId}.
 */

/**
 * Save/update push notification token
 * @param {string} expoPushToken - Expo push token
 * @param {string} platform - 'ios' or 'android'
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export const savePushToken = async (expoPushToken, platform) => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error("Not authenticated");
    }

    // Upsert (insert or update) push token
    const { error } = await supabase.from("push_tokens").upsert(
      {
        user_id: user.id,
        expo_push_token: expoPushToken,
        platform: platform,
      },
      {
        onConflict: "user_id", // Update if user_id already exists
      }
    );

    if (error) throw error;

    return {
      success: true,
    };
  } catch (error) {
    console.error("Save push token error:", error);
    return {
      success: false,
      error: error.message || "Failed to save push token",
    };
  }
};

/**
 * Sign out
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export const signOut = async () => {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;

    return {
      success: true,
    };
  } catch (error) {
    console.error("Sign out error:", error);
    return {
      success: false,
      error: error.message || "Failed to sign out",
    };
  }
};

// Daily reward helpers (client-side persistence via AsyncStorage)
const DAILY_KEY_FOR = (profileId) => `@daily_reward_${profileId}`;

/**
 * Load daily reward state for a profile.
 * State shape stored in AsyncStorage:
 * { claimedDays: [bool,...7], nextAvailableAt: ISO|null }
 */
export const getDailyRewardState = async (profileId) => {
  if (!profileId) return { success: false, error: "No profileId" };
  try {
    const key = DAILY_KEY_FOR(profileId);
    const raw = await AsyncStorage.getItem(key);
    let state = null;
    if (raw) state = JSON.parse(raw);
    if (!state) {
      state = {
        claimedDays: [false, false, false, false, false, false, false],
        nextAvailableAt: null,
      };
    }

    const now = new Date();

    // If all days claimed and nextAvailableAt passed -> reset cycle
    const allClaimed = state.claimedDays.every(Boolean);
    if (allClaimed && state.nextAvailableAt) {
      const next = new Date(state.nextAvailableAt);
      if (now >= next) {
        state = {
          claimedDays: [false, false, false, false, false, false, false],
          nextAvailableAt: null,
        };
        await AsyncStorage.setItem(key, JSON.stringify(state));
      }
    }

    // compute available index (first false)
    const availableIdx = state.claimedDays.findIndex((v) => !v);
    const nextAvailableAt = state.nextAvailableAt
      ? new Date(state.nextAvailableAt)
      : null;
    const canClaim =
      availableIdx !== -1 && (!nextAvailableAt || now >= nextAvailableAt);

    return {
      success: true,
      claimedDays: state.claimedDays,
      nextAvailableAt: state.nextAvailableAt,
      availableDay: availableIdx === -1 ? null : availableIdx + 1,
      canClaim,
    };
  } catch (e) {
    console.error("getDailyRewardState error", e);
    return { success: false, error: e?.message || String(e) };
  }
};

/**
 * Claim daily reward for a profile. Returns updated credits if successful.
 */
export const claimDailyReward = async (profileId) => {
  if (!profileId) return { success: false, error: "No profileId" };
  const key = DAILY_KEY_FOR(profileId);
  try {
    const raw = await AsyncStorage.getItem(key);
    let state = raw
      ? JSON.parse(raw)
      : {
          claimedDays: [false, false, false, false, false, false, false],
          nextAvailableAt: null,
        };

    const now = new Date();

    // Reset if cycle finished and nextAvailableAt passed
    const allClaimed = state.claimedDays.every(Boolean);
    if (allClaimed && state.nextAvailableAt) {
      const next = new Date(state.nextAvailableAt);
      if (now >= next) {
        state = {
          claimedDays: [false, false, false, false, false, false, false],
          nextAvailableAt: null,
        };
      }
    }

    const idx = state.claimedDays.findIndex((v) => !v);
    if (idx === -1) return { success: false, error: "Cycle already completed" };

    const nextAvailableAt = state.nextAvailableAt
      ? new Date(state.nextAvailableAt)
      : null;
    if (nextAvailableAt && now < nextAvailableAt)
      return { success: false, error: "Not available yet" };

    const dayNum = idx + 1;
    const reward = dayNum < 7 ? 250 : 1000;

    // Fetch current profile credits
    const {
      data: { user },
    } = await supabase.auth.getUser();
    let uid = user?.id || profileId;
    // Try to fetch profile row
    let profile = null;
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,credits")
        .eq("id", uid)
        .maybeSingle();
      if (!error && data) profile = data;
    } catch (e) {}

    const currentCredits =
      profile && profile.credits != null ? Number(profile.credits) : 0;
    const newCredits = Math.round((currentCredits + reward) * 100) / 100;

    // Prefer calling server endpoint which uses service-role to update credits
    let serverUpdated = false;
    try {
      // Try to get server token first, otherwise use Supabase session token
      let authToken = null;
      try {
        const serverToken = await AsyncStorage.getItem("@bet_token");
        if (serverToken) authToken = serverToken;
      } catch (e) {}
      if (!authToken) {
        try {
          const { data: { session } = {} } = await supabase.auth.getSession();
          if (session && session.access_token) authToken = session.access_token;
        } catch (e) {}
      }

      if (authToken) {
        const SERVER_BASE =
          "https://laraiyeogithubio-production-f5af.up.railway.app";
        const resp = await fetch(`${SERVER_BASE}/api/daily/claim`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ amount: reward, reason: `Daily login day ${dayNum}` }),
        });
        if (resp.ok) {
          try {
            const json = await resp.json();
            if (json && json.user && json.user.credits != null) {
              serverUpdated = true;
              // Use the server-returned credits as authoritative
              const svcCredits = Number(json.user.credits);
              // Update local newCredits to reflect authoritative value
              // (so the caller sees the right value)
              // NOTE: we still write AsyncStorage state below.
              return { success: true, day: dayNum, reward, newCredits: svcCredits };
            }
          } catch (e) {
            // fall through to client update
          }
        } else {
          // server rejected request; fall back to client update
        }
      }
    } catch (e) {
      console.warn("claimDailyReward: server endpoint call failed", e?.message || e);
    }

    if (!serverUpdated) {
      // Update profile credits locally via Supabase client (may be blocked by RLS)
      try {
        const { error } = await supabase
          .from("profiles")
          .update({ credits: newCredits })
          .eq("id", uid);
        if (error)
          console.warn(
            "claimDailyReward: failed to update credits",
            error.message || error
          );
      } catch (e) {
        console.error("claimDailyReward: update credits error", e);
      }
    }

    // Insert credit_ledger entry (best-effort) - match DB schema: (change, reason)
    try {
      await supabase
        .from("credit_ledger")
        .insert({
          user_id: uid,
          change: reward,
          reason: `Daily login day ${dayNum}`,
          created_at: new Date().toISOString(),
        });
    } catch (e) {
      console.warn(
        "claimDailyReward: failed to write credit_ledger",
        e?.message || e
      );
    }

    // Mark claimed and set nextAvailableAt = now + 24h
    state.claimedDays[idx] = true;
    const nextAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    state.nextAvailableAt = nextAt.toISOString();
    await AsyncStorage.setItem(key, JSON.stringify(state));

    return { success: true, day: dayNum, reward, newCredits };
  } catch (e) {
    console.error("claimDailyReward error", e);
    return { success: false, error: e?.message || String(e) };
  }
};

/**
 * Dismiss the daily reward modal for 24 hours without claiming.
 * Sets nextAvailableAt = now + 24h so the modal won't reappear.
 */
export const dismissDailyReward = async (profileId) => {
  if (!profileId) return { success: false, error: "No profileId" };
  const key = DAILY_KEY_FOR(profileId);
  try {
    const raw = await AsyncStorage.getItem(key);
    let state = raw
      ? JSON.parse(raw)
      : {
          claimedDays: [false, false, false, false, false, false, false],
          nextAvailableAt: null,
        };
    const now = new Date();
    const nextAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    state.nextAvailableAt = nextAt.toISOString();
    await AsyncStorage.setItem(key, JSON.stringify(state));
    return { success: true, nextAvailableAt: state.nextAvailableAt };
  } catch (e) {
    console.error("dismissDailyReward error", e);
    return { success: false, error: e?.message || String(e) };
  }
};

/**
 * DEBUG helper: reset daily reward timer/state for testing.
 * Sets `nextAvailableAt` to null and clears `claimedDays` so the reward is immediately claimable.
 */
export const resetDailyRewardForTesting = async (profileId) => {
  if (!profileId) return { success: false, error: "No profileId" };
  const key = DAILY_KEY_FOR(profileId);
  try {
    const raw = await AsyncStorage.getItem(key);
    let state = raw
      ? JSON.parse(raw)
      : {
          claimedDays: [false, false, false, false, false, false, false],
          nextAvailableAt: null,
        };
    state.claimedDays = [false, false, false, false, false, false, false];
    state.nextAvailableAt = null;
    await AsyncStorage.setItem(key, JSON.stringify(state));
    return { success: true, ...state };
  } catch (e) {
    console.error("resetDailyRewardForTesting error", e);
    return { success: false, error: e?.message || String(e) };
  }
};

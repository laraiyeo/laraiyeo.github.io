import { supabase } from "../config/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Helper: decode a JWT without external deps (returns payload object)
function decodeJwt(token) {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = parts[1];
    const padded = payload.padEnd(payload.length + (4 - (payload.length % 4)) % 4, '=');
    const decoded = Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return JSON.parse(decoded);
  } catch (e) {
    return null;
  }
}

/**
 * Place a bet - automatically deducts credits
 * @param {string} gameId - The game ID
 * @param {string} selection - Team/player selected
 * @param {number} amount - Amount to bet
 * @param {number} odds - Odds for the bet
 * @returns {Promise<{success: boolean, betslipId?: string, error?: string}>}
 */
export const placeBet = async (gameId, selection, amount, odds) => {
  try {
    // Call the place_bet database function
    // This function handles credit deduction and betslip creation atomically
    const { data, error } = await supabase.rpc("place_bet", {
      p_game_id: gameId,
      p_selection: selection,
      p_amount: amount,
      p_odds: odds,
    });

    if (error) throw error;

    return {
      success: true,
      betslipId: data, // Returns the UUID of the created betslip
    };
  } catch (error) {
    console.error("Place bet error:", error);
    return {
      success: false,
      error: error.message || "Failed to place bet",
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
        const { data: prof } = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle();
        if (prof && prof.id) profileId = prof.id;
      } catch (e) { /* ignore */ }
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
        const { data: prof } = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle();
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

    // Resolve profileId (prefer server token, then profiles table, else auth user id)
    let profileId = null;
    try {
      const serverToken = await AsyncStorage.getItem("@bet_token");
      if (serverToken) {
        const p = decodeJwt(serverToken);
        if (p && p.profileId) profileId = p.profileId;
      }
    } catch (e) {}

    let username = null;
    try {
      if (profileId) {
        const { data: profileData } = await supabase.from('profiles').select('username').eq('id', profileId).maybeSingle();
        if (profileData && profileData.username) username = profileData.username;
      } else {
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", user.id)
          .maybeSingle();
        if (profileData && profileData.username) username = profileData.username;
      }
    } catch (e) { /* ignore */ }

    // Normalize bets
    const bets = Array.isArray(betslipData && betslipData.bets)
      ? betslipData.bets
      : betslipData && betslipData.bets
      ? [betslipData.bets]
      : betslipData && betslipData.id
      ? [betslipData]
      : [];

    const createdAt = new Date().toISOString();

    const firstBet = bets[0] || betslipData || {};

    // compute total decimal odds for the ticket (product of individual decimal odds)
    const decimalOddsArr = bets.map((b) => {
      const o = parseInt(b.odds);
      if (isNaN(o)) return 1;
      return o > 0 ? o / 100 + 1 : 100 / Math.abs(o) + 1;
    });
    const totalDecimalOdds = decimalOddsArr.reduce((acc, v) => acc * v, 1);

    const payload = {
      user_id: profileId || user.id,
      user_username: username,
      betslip_data: typeof betslipData === "object" ? betslipData : { bets },
      total_stake: totalStake || 0,
      potential_payout:
        potentialPayout || +((totalStake || 0) * totalDecimalOdds).toFixed(2),
      total_odds: totalDecimalOdds,
      status: "pending",
      created_at: createdAt,
      // representative structured columns so older UI queries can read them
      game_id: firstBet.gameId || firstBet.game_id || "",
      selection: firstBet.description || firstBet.selection || null,
      amount: firstBet.amount != null ? parseFloat(firstBet.amount) : null,
      odds: firstBet.odds != null ? String(firstBet.odds) : null,
    };

    // Try aggregated insert and return inserted id
    const insertRes = await supabase
      .from("betslips")
      .insert(payload)
      .select("id")
      .single();
    if (!insertRes.error && insertRes.data && insertRes.data.id) {
      return { success: true, betslipId: insertRes.data.id };
    }

    // Aggregated insert failed — fallback to per-bet inserts with shared created_at
    // Build an aggregated betslip object to store on the first fallback row so
    // the DB contains a ticket-level representation even when single-row insert fails.
    const aggregatedBetslip = {
      bets,
      meta: { timestamp: createdAt, amount: totalStake || 0 },
      total_odds: totalDecimalOdds,
      total_stake: totalStake || 0,
      potential_payout:
        potentialPayout || +((totalStake || 0) * totalDecimalOdds).toFixed(2),
    };

    // Instead of creating one DB row per pick (legacy per-bet rows), insert
    // a single aggregated ticket row so we only create one row per betslip.
    // This keeps DB state consistent (one row with `betslip_data`) while
    // preserving representative legacy columns for compatibility.
    const first = bets[0] || {};
    const singlePayload = {
      user_id: profileId || user.id,
      user_username: username,
      betslip_data: aggregatedBetslip,
      total_stake: totalStake || 0,
      potential_payout:
        potentialPayout || +((totalStake || 0) * totalDecimalOdds).toFixed(2),
      total_odds: totalDecimalOdds,
      status: "pending",
      created_at: createdAt,
      // representative legacy columns (keep types safe)
      game_id: first.gameId || first.game_id || "",
      selection: first.description || first.selection || null,
      amount: first.amount != null ? parseFloat(first.amount) : totalStake || 0,
      odds: first.odds != null ? String(first.odds) : null,
      // camelCase compatibility fields
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

    const { data: d2, error: e2 } = await supabase
      .from("betslips")
      .insert(singlePayload)
      .select("id")
      .single();
    if (e2) throw e2;
    const id = d2 && d2.id ? d2.id : null;
    return { success: true, betslipId: id };
  } catch (error) {
    console.error("Create betslip error:", error);
    return {
      success: false,
      error: error.message || "Failed to create betslip",
    };
  }
};

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

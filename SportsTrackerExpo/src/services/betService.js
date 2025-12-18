import { supabase } from "../config/supabase";

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

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

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

    let query = supabase
      .from("betslips")
      .select("*")
      .eq("user_id", user.id)
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

    const { data, error } = await supabase
      .from("bet_history")
      .select("*")
      .eq("user_id", user.id)
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

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const cron = require("node-cron");
require("dotenv").config();
const crypto = require("crypto");

// Supabase admin client and inlined services
const { createClient } = require("@supabase/supabase-js");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const { Expo } = require("expo-server-sdk");

// Create Supabase admin client from env
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = createClient(
  SUPABASE_URL || "",
  SUPABASE_SERVICE_ROLE_KEY || "",
  {
    auth: { persistSession: false },
  }
);

// Betslip cleanup scheduler: clear betslips 24 hours after creation.
const betslipCleanupTimers = {};

const MS_IN_24H = 24 * 60 * 60 * 1000;

async function clearBetslipNow(betslipId) {
  try {
    console.log(`[betslip-cleaner] clearing betslip ${betslipId} now`);
    const { error } = await supabaseAdmin
      .from("betslips")
      .delete()
      .eq("id", betslipId);
    if (error) {
      console.error(
        "[betslip-cleaner] failed to delete betslip",
        betslipId,
        error
      );
    } else {
      console.log(`[betslip-cleaner] deleted betslip ${betslipId}`);
    }
  } catch (e) {
    console.error(
      "[betslip-cleaner] error clearing betslip",
      betslipId,
      e?.message || e
    );
  } finally {
    try {
      if (betslipCleanupTimers[betslipId]) {
        clearTimeout(betslipCleanupTimers[betslipId]);
        delete betslipCleanupTimers[betslipId];
      }
    } catch (e) {}
  }
}

function scheduleClearBetslip(betslip) {
  try {
    const id = betslip.id || betslip; // accept either id or object
    const createdAt =
      betslip.created_at || betslip.createdAt || betslip.created || null;
    let delay = MS_IN_24H;
    if (createdAt) {
      const createdTs = new Date(createdAt).getTime();
      const target = createdTs + MS_IN_24H;
      delay = target - Date.now();
    }

    if (delay <= 0) {
      // already past 24h -> clear immediately (async)
      clearBetslipNow(id);
      return;
    }

    // Clear any existing timer
    if (betslipCleanupTimers[id]) {
      clearTimeout(betslipCleanupTimers[id]);
    }

    const handle = setTimeout(() => clearBetslipNow(id), delay);
    betslipCleanupTimers[id] = handle;
    console.log(
      `[betslip-cleaner] scheduled clear for ${id} in ${Math.round(
        delay / 1000
      )}s`
    );
  } catch (e) {
    console.error("[betslip-cleaner] schedule error", e?.message || e);
  }
}

// On startup, schedule clears for recent betslips (those created within the last 24h)
async function initBetslipCleaner() {
  try {
    const threshold = new Date(Date.now() - MS_IN_24H).toISOString();
    const { data, error } = await supabaseAdmin
      .from("betslips")
      .select("id, created_at")
      .gt("created_at", threshold);
    if (error) {
      console.error("[betslip-cleaner] init query failed", error);
    } else if (Array.isArray(data)) {
      data.forEach((r) => scheduleClearBetslip(r));
    }
  } catch (e) {
    console.error("[betslip-cleaner] init failed", e?.message || e);
  }

  // Periodic sweep to remove any missed rows (runs every 15 minutes)
  setInterval(async () => {
    try {
      const threshold = new Date(Date.now() - MS_IN_24H).toISOString();
      const { error } = await supabaseAdmin
        .from("betslips")
        .delete()
        .lte("created_at", threshold);
      if (error) console.error("[betslip-cleaner] sweep delete error", error);
      else console.log("[betslip-cleaner] sweep completed");
    } catch (e) {
      console.error("[betslip-cleaner] sweep failed", e?.message || e);
    }
  }, 15 * 60 * 1000);
}

// Initialize cleaner asynchronously (don't block startup)
initBetslipCleaner().catch((e) => console.error("initBetslipCleaner", e));

const expo = new Expo();

// Small helper: send push notification via Supabase-stored tokens
async function sendPushNotification(userId, title, bodyText, data = {}) {
  try {
    let resolvedProfileId = null;
    let resolvedUserRow = null;
    let pushTokens = [];

    // ================================================================
    // Build notification from betslip if needed
    // ================================================================
    try {
      const betslipId = data?.betslipId;
      if ((!title || !bodyText) && betslipId) {
        const { data: bs, error: bsErr } = await supabaseAdmin
          .from("betslips")
          .select("*")
          .eq("id", betslipId)
          .maybeSingle();

        if (bsErr) {
          console.error("sendPushNotification: failed to fetch betslip", bsErr);
        } else if (bs) {
          if (!userId && bs.user_id) userId = bs.user_id;

          let legsCount = 0;
          try {
            const dataObj =
              typeof bs.betslip_data === "string"
                ? JSON.parse(bs.betslip_data)
                : bs.betslip_data;

            if (dataObj) {
              if (Array.isArray(dataObj.bets)) legsCount = dataObj.bets.length;
              else if (Array.isArray(dataObj.events)) {
                for (const ev of dataObj.events) {
                  if (ev.bets) {
                    if (Array.isArray(ev.bets.players))
                      legsCount += ev.bets.players.length;
                    if (ev.bets.moneyline) legsCount += 1;
                    if (ev.bets.totalPoints) legsCount += 1;
                    if (ev.bets.spread) legsCount += 1;
                  }
                }
              }
            }
          } catch (e) {
            console.warn(
              "sendPushNotification: failed to parse betslip_data",
              e?.message || e
            );
          }

          const stake =
            parseFloat(
              bs.total_stake ||
                bs.amount ||
                (typeof bs.betslip_data === "object"
                  ? bs.betslip_data?.total_stake
                  : NaN)
            ) || 0;

          const potential = parseFloat(
            bs.potential_payout ||
              (typeof bs.betslip_data === "object"
                ? bs.betslip_data?.potential_payout
                : bs.potential_payout)
          );

          const potentialRounded = Number.isFinite(potential)
            ? potential.toFixed(2)
            : null;

          if (!title) {
            if (bs.status === "won") title = "🎉 Bet Won!";
            else if (bs.status === "lost") title = "Bet Lost 😔";
            else title = "Bet Update";
          }

          if (!bodyText) {
            if (bs.status === "won") {
              bodyText = potentialRounded
                ? `Congrats! Your ${legsCount || ""} bet has won! You've won ${potentialRounded} credits!`
                : `Congrats! Your bet has won!`;
            } else if (bs.status === "lost") {
              bodyText = legsCount
                ? `Unfortunately, your ${legsCount} leg bet has lost.`
                : `Unfortunately, your bet has lost.`;
            } else {
              bodyText = `Your ${legsCount} leg bet has been updated.`;
            }
          }
        }
      }
    } catch (e) {
      console.error(
        "sendPushNotification: betslip lookup/build failed",
        e?.message || e
      );
    }

    // ================================================================
    // Resolve profile UUID
    // ================================================================
    try {
      const looksLikeUuid = typeof userId === "string" && userId.includes("-");

      if (looksLikeUuid) {
        const { data: prof } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("id", userId)
          .maybeSingle();

        if (prof) resolvedProfileId = prof.id;
      }
    } catch (e) {
      console.warn(
        "sendPushNotification: profiles lookup failed",
        e?.message || e
      );
    }

    // ================================================================
    // Fetch ALL push tokens
    // ================================================================
    if (resolvedProfileId) {
      const { data, error } = await supabaseAdmin
        .from("push_tokens")
        .select("expo_push_token")
        .eq("user_id", resolvedProfileId);

      if (!error && data?.length) {
        pushTokens.push(...data.map(t => t.expo_push_token));
      }
    }

    if (!pushTokens.length && userId) {
      const { data, error } = await supabaseAdmin
        .from("push_tokens")
        .select("expo_push_token")
        .eq("user_id", userId);

      if (!error && data?.length) {
        pushTokens.push(...data.map(t => t.expo_push_token));
      }
    }

    // Deduplicate + validate
    pushTokens = [
      ...new Set(pushTokens.filter(Expo.isExpoPushToken)),
    ];

    if (!pushTokens.length) {
      console.log(
        "No valid push tokens for user",
        userId,
        "resolvedProfileId",
        resolvedProfileId
      );
      return;
    }

    // ================================================================
    // Send push to ALL devices
    // ================================================================
    const messages = pushTokens.map(token => ({
      to: token,
      sound: "default",
      title,
      body: bodyText,
      data,
      priority: "high",
    }));

    const chunks = expo.chunkPushNotifications(messages);

    for (const chunk of chunks) {
      try {
        const tickets = await expo.sendPushNotificationsAsync(chunk);

        tickets.forEach(ticket => {
          if (ticket.status === "error") {
            console.error("Expo push error:", ticket.message, ticket.details);
          }
        });
      } catch (err) {
        console.error("Expo send error", err);
      }
    }

    // ================================================================
    // Persist notification (once)
    // ================================================================
    try {
      await supabaseAdmin.from("push_notifications").insert({
        user_id: userId,
        title,
        body: bodyText,
        data,
      });
    } catch (insErr) {
      console.warn(
        "push_notifications insert failed, retrying without user_id",
        insErr?.message || insErr
      );

      await supabaseAdmin.from("push_notifications").insert({
        user_id: null,
        title,
        body: bodyText,
        data: {
          ...data,
          user_uuid: resolvedProfileId || null,
          legacy_user_id:
            typeof userId === "number" || /^[0-9]+$/.test(String(userId))
              ? userId
              : null,
        },
      });
    }
  } catch (err) {
    console.error("sendPushNotification error", err?.message || err);
  }
}


async function broadcastToAll(title, bodyText, data = {}) {
  try {
    const { data: tokens, error: tokensErr } = await supabaseAdmin
      .from("push_tokens")
      .select("expo_push_token");
    if (tokensErr)
      console.error("broadcastToAll: failed to read push_tokens", tokensErr);
    console.log(
      `[broadcastToAll] sending to ${
        Array.isArray(tokens) ? tokens.length : 0
      } token(s)`
    );
    const messages = (tokens || []).map((t) => ({
      to: t.expo_push_token,
      sound: "default",
      title,
      body: bodyText,
      data,
    }));
    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      try {
        await expo.sendPushNotificationsAsync(chunk);
      } catch (e) {
        console.error("broadcast chunk error", e);
      }
    }
    await supabaseAdmin
      .from("push_notifications")
      .insert({ title, body: bodyText, data });
  } catch (e) {
    console.error("broadcastToAll error", e);
  }
}

// Send a push to a single Expo token (no DB user association)
async function sendPushToToken(pushToken, title, bodyText, data = {}) {
  try {
    if (!Expo.isExpoPushToken(pushToken)) {
      console.error("Invalid Expo push token:", pushToken);
      return false;
    }

    const message = {
      to: pushToken,
      sound: "default",
      title,
      body: bodyText,
      data,
      priority: "high",
    };

    const chunks = expo.chunkPushNotifications([message]);
    for (const chunk of chunks) {
      try {
        await expo.sendPushNotificationsAsync(chunk);
      } catch (err) {
        console.error("sendPushToToken chunk error", err);
      }
    }
    return true;
  } catch (e) {
    console.error("sendPushToToken error", e);
    return false;
  }
}

// Send bet result notification by looking up betslip and profile, then delegating to sendPushNotification
async function sendBetResultNotification(betslipId) {
  try {
    const { data: bs, error: bsErr } = await supabaseAdmin
      .from("betslips")
      .select("user_id")
      .eq("id", betslipId)
      .maybeSingle();
    if (bsErr) throw bsErr;
    if (!bs) return;

    const userId = bs.user_id;
    console.log(
      `[sendBetResultNotification] delegating -> user:${userId} betslip:${betslipId}`
    );
    // Only send user id and betslip reference; let centralized push handler decide message
    await sendPushNotification(userId, null, null, { betslipId });
  } catch (e) {
    console.error("sendBetResultNotification error", e);
  }
}

// Manual fallback settlement when RPC is unavailable or errors.
async function manualSettleBetslip(betslipId, result) {
  try {
    const { data: bsRows, error: bsErr } = await supabaseAdmin
      .from("betslips")
      .select("*")
      .eq("id", betslipId)
      .limit(1);
    if (bsErr) {
      console.error(
        `[manualSettleBetslip] failed to fetch betslip ${betslipId}`,
        bsErr
      );
      return;
    }
    const fresh = (bsRows && bsRows[0]) || null;
    if (!fresh) {
      console.warn(`[manualSettleBetslip] betslip not found ${betslipId}`);
      return;
    }

    let payout = 0;
    if (result === "won")
      payout = Number(fresh.potential_payout || fresh.payout || 0);
    else if (result === "push" || result === "void")
      payout = Number(fresh.total_stake || 0);
    else payout = 0;
    payout = Math.round((payout + Number.EPSILON) * 100) / 100;

    // If positive payout, credit profile and record ledger/history
    if (payout > 0) {
      // Update profile credits atomically: read then update
      const { data: profRows, error: profErr } = await supabaseAdmin
        .from("profiles")
        .select("credits")
        .eq("id", fresh.user_id)
        .limit(1);
      if (profErr) {
        console.error(
          `[manualSettleBetslip] failed to read profile ${fresh.user_id}`,
          profErr
        );
      }
      const profile = (profRows && profRows[0]) || null;
      const currentCredits = Number(profile?.credits || 0);
      let newCredits = currentCredits + payout;
      if (!Number.isFinite(newCredits)) newCredits = 0;
      newCredits = Number(
        (Math.round((newCredits + Number.EPSILON) * 100) / 100).toFixed(2)
      );
      const { data: updProf, error: updProfErr } = await supabaseAdmin
        .from("profiles")
        .update({ credits: newCredits })
        .eq("id", fresh.user_id);
      if (updProfErr) {
        console.error(
          `[manualSettleBetslip] failed to update profile ${fresh.user_id}`,
          updProfErr
        );
      } else {
        console.log(
          `[manualSettleBetslip] profile ${fresh.user_id} credited -> ${newCredits}`
        );
      }

      const { data: ledgerRes, error: ledgerErr } = await supabaseAdmin
        .from("credit_ledger")
        .insert({
          user_id: fresh.user_id,
          betslip_id: betslipId,
          change: payout,
          reason: "Bet won",
        });
      if (ledgerErr)
        console.error(
          `[manualSettleBetslip] credit_ledger insert failed`,
          ledgerErr
        );

      const { data: bhRes, error: bhErr } = await supabaseAdmin
        .from("bet_history")
        .insert({
          user_id: fresh.user_id,
          betslip_id: betslipId,
          change_amount: payout,
          reason: "Bet settled - payout",
        });
      if (bhErr)
        console.error(`[manualSettleBetslip] bet_history insert failed`, bhErr);
    } else {
      const { data: bhRes, error: bhErr } = await supabaseAdmin
        .from("bet_history")
        .insert({
          user_id: fresh.user_id,
          betslip_id: betslipId,
          change_amount: 0,
          reason: "Bet settled - no payout",
        });
      if (bhErr)
        console.error(
          `[manualSettleBetslip] bet_history (no payout) insert failed`,
          bhErr
        );
    }

    // Update betslip status to the final result (won/lost/push/void).
    // Some deployments don't include `settled_at` or `payout` columns in the
    // table schema. To be compatible, only update `status` here. The trigger
    // `update_updated_at_column` will set `updated_at` if configured.
    const { data: updBetslip, error: updBetslipErr } = await supabaseAdmin
      .from("betslips")
      .update({
        status: result,
      })
      .eq("id", betslipId);
    if (updBetslipErr) {
      console.error(
        `[manualSettleBetslip] failed to update betslip ${betslipId}`,
        updBetslipErr
      );
    } else {
      console.log(
        `[manualSettleBetslip] updated betslip ${betslipId}`,
        updBetslip && updBetslip[0] ? updBetslip[0] : updBetslip
      );
    }

    console.log(
      `[manualSettleBetslip] settled ${betslipId} -> ${result} payout=${payout}`
    );
  } catch (e) {
    console.error(
      `[manualSettleBetslip] error settling ${betslipId}:`,
      e?.message || e
    );
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
// Capture raw request body for webhook signature verification
app.use(
  express.json({
    verify: (req, res, buf) => {
      try {
        req.rawBody = buf;
      } catch (e) {
        req.rawBody = null;
      }
    },
  })
);

// Backwards-compatibility aliases: map singular /api/betslip (used by client)
// to the plural /api/betslips routes implemented in this server. We only
// rewrite requests that are intended to hit the betslips handlers so we don't
// accidentally remap the existing /api/betslip GET (which returns a generated
// betslip payload).
app.use((req, res, next) => {
  try {
    const method = (req.method || "").toUpperCase();
    const orig = req.originalUrl || req.url || "";
    const path = req.path || "";

    // Map POST /api/betslip -> /api/betslips (create bet)
    if (method === "POST" && path === "/api/betslip") {
      req.url = orig.replace("/api/betslip", "/api/betslips");
      console.log(`[route-alias] Rewritten POST ${orig} -> ${req.url}`);
    }

    // Map per-id operations: /api/betslip/:id/... -> /api/betslips/:id/...
    if (path.startsWith("/api/betslip/")) {
      req.url = orig.replace("/api/betslip/", "/api/betslips/");
      console.log(`[route-alias] Rewritten ${method} ${orig} -> ${req.url}`);
    }
  } catch (e) {
    console.warn("route-alias middleware error", e?.message || e);
  }
  next();
});

// Forwarding aliases: for clients that call singular `/api/betslip` for writes
// (the project historically used the singular path), forward those requests to
// the plural handlers implemented below. This preserves existing client code
// without duplicating full handler logic. We forward the method, headers and
// body and return the upstream response. These forwards are logged.
app.post("/api/betslip", async (req, res) => {
  try {
    const base = process.env.PUBLIC_API_URL || `http://localhost:${PORT}`;
    console.log(
      `[route-alias-forward] forwarding POST /api/betslip -> ${base}/api/betslips`
    );
    const resp = await axios.post(
      `${base.replace(/\/$/, "")}/api/betslips`,
      req.body,
      {
        headers: { ...(req.headers || {}), host: undefined },
        timeout: 15000,
      }
    );
    return res.status(resp.status).json(resp.data);
  } catch (e) {
    console.error(
      "[route-alias-forward] POST /api/betslip forward failed",
      e?.message || e
    );
    if (e.response) return res.status(e.response.status).send(e.response.data);
    return res.status(500).json({ error: "forward failed" });
  }
});

// Daily reward endpoints (state, claim, dismiss)
// GET state: returns { day, claimed, claimedAt, nextAvailableAt }
app.get("/api/daily/state", authMiddlewareInline, async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { data: profileRow, error: selectErr } = await supabaseAdmin
      .from("profiles")
      .select(
        "daily_available_day, daily_claimed, daily_claimed_at, daily_next_available_at"
      )
      .eq("id", userId)
      .maybeSingle();
    if (selectErr) throw selectErr;

    let day = profileRow?.daily_available_day || 1;
    let claimed = !!profileRow?.daily_claimed;
    let claimedAt = profileRow?.daily_claimed_at || null;
    let nextAvailableAt = profileRow?.daily_next_available_at || null;

    // Lazy roll-forward: if nextAvailableAt has passed and the current day was claimed,
    // advance to next day and clear claimed flags.
    if (nextAvailableAt) {
      const now = new Date();
      const nextDate = new Date(nextAvailableAt);
      if (now >= nextDate && claimed) {
        const newDay = (day || 1) + 1 > 7 ? 1 : (day || 1) + 1;
        const { error: updErr } = await supabaseAdmin
          .from("profiles")
          .update({
            daily_available_day: newDay,
            daily_claimed: false,
            daily_claimed_at: null,
            daily_next_available_at: null,
          })
          .eq("id", userId);
        if (updErr) throw updErr;
        day = newDay;
        claimed = false;
        claimedAt = null;
        nextAvailableAt = null;
      }
    }

    return res.json({
      success: true,
      day,
      claimed,
      claimedAt,
      nextAvailableAt,
    });
  } catch (e) {
    console.error("/api/daily/state error", e?.message || e);
    return res.status(500).json({ message: "Server error" });
  }
});

// POST claim: claims current available day if eligible, updates credits and claim state
app.post("/api/daily/claim", authMiddlewareInline, async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    // Read profile fields with admin client
    const { data: profileRow, error: selectErr } = await supabaseAdmin
      .from("profiles")
      .select(
        "credits, is_pro, daily_available_day, daily_claimed, daily_next_available_at"
      )
      .eq("id", userId)
      .maybeSingle();
    if (selectErr) throw selectErr;

    const now = new Date();
    let day = profileRow?.daily_available_day || 1;
    let claimed = !!profileRow?.daily_claimed;
    const nextAvailableAt = profileRow?.daily_next_available_at
      ? new Date(profileRow.daily_next_available_at)
      : null;

    // If a nextAvailableAt exists and is in the future, not available yet
    if (nextAvailableAt && now < nextAvailableAt) {
      return res.status(400).json({ message: "Not available yet" });
    }

    // If already claimed for this day, reject
    if (claimed) return res.status(400).json({ message: "Already claimed" });

    // Determine reward
    const baseReward = day < 7 ? 250 : 1000;
    const reward =
      profileRow && profileRow.is_pro ? baseReward + 500 : baseReward;

    const currentCredits = Number(profileRow?.credits || 0);
    const newCredits = Math.round((currentCredits + reward) * 100) / 100;

    // Update credits and daily claim state atomically
    const { data: updatedProfile, error: updateErr } = await supabaseAdmin
      .from("profiles")
      .update({
        credits: newCredits,
        daily_claimed: true,
        daily_claimed_at: now.toISOString(),
        daily_next_available_at: new Date(
          now.getTime() + 24 * 60 * 60 * 1000
        ).toISOString(),
      })
      .eq("id", userId)
      .select(
        "id, credits, daily_available_day, daily_claimed, daily_claimed_at, daily_next_available_at"
      )
      .maybeSingle();
    if (updateErr) throw updateErr;

    // Log updated profile for diagnostics (helps verify persisted fields)
    console.log("/api/daily/claim: updated profile:", updatedProfile);
    if (!updatedProfile) {
      console.warn(
        "/api/daily/claim: update completed but returned no row (0 rows affected)"
      );
    }

    // Insert ledger row for audit (best-effort: do not fail the route if ledger insert fails)
    try {
      const { error: ledgerErr } = await supabaseAdmin
        .from("credit_ledger")
        .insert({
          user_id: userId,
          betslip_id: null,
          change: reward,
          reason: `Daily login day ${day}`,
        });
      if (ledgerErr) console.warn("credit_ledger insert failed", ledgerErr);
    } catch (ledgerEx) {
      console.warn(
        "credit_ledger insert exception",
        ledgerEx?.message || ledgerEx
      );
    }

    // Read back the profile to verify persistence and log detailed diagnostics
    let verifyRow = null;
    try {
      const { data, error: verifyErr } = await supabaseAdmin
        .from("profiles")
        .select(
          "id, credits, daily_available_day, daily_claimed, daily_claimed_at, daily_next_available_at, updated_at"
        )
        .eq("id", userId)
        .maybeSingle();
      if (verifyErr) {
        console.warn("/api/daily/claim: verify read failed", verifyErr);
      } else {
        verifyRow = data;
        console.log(
          "/api/daily/claim: verify profile after update:",
          verifyRow
        );
        if (
          typeof verifyRow.credits !== "undefined" &&
          Number(verifyRow.credits) !== Number(newCredits)
        ) {
          console.warn("/api/daily/claim: credits mismatch after update", {
            expected: newCredits,
            actual: verifyRow.credits,
          });
        }
        if (verifyRow.daily_claimed !== true) {
          console.warn(
            "/api/daily/claim: daily_claimed not true after update",
            { daily_claimed: verifyRow.daily_claimed }
          );
        }
      }
    } catch (verifyEx) {
      console.warn(
        "/api/daily/claim: verify read exception",
        verifyEx?.message || verifyEx
      );
    }

    return res.json({
      success: true,
      user: updatedProfile,
      verify: verifyRow || null,
      day,
      reward,
    });
  } catch (e) {
    console.error("/api/daily/claim error", e?.message || e);
    return res.status(500).json({ message: "Server error" });
  }
});

// POST dismiss: set nextAvailableAt = now + 24h to suppress modal without claiming
app.post("/api/daily/dismiss", authMiddlewareInline, async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const now = new Date();
    const nextAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const { data: updated, error: updErr } = await supabaseAdmin
      .from("profiles")
      .update({ daily_next_available_at: nextAt })
      .eq("id", userId)
      .select("daily_next_available_at")
      .maybeSingle();
    if (updErr) throw updErr;
    return res.json({
      success: true,
      nextAvailableAt: updated.daily_next_available_at,
    });
  } catch (e) {
    console.error("/api/daily/dismiss error", e?.message || e);
    return res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/betslip/:id/watch", async (req, res) => {
  try {
    const { id } = req.params;
    const base = process.env.PUBLIC_API_URL || `http://localhost:${PORT}`;
    console.log(
      `[route-alias-forward] forwarding POST /api/betslip/${id}/watch -> ${base}/api/betslips/${id}/watch`
    );
    const resp = await axios.post(
      `${base.replace(/\/$/, "")}/api/betslips/${id}/watch`,
      req.body || {},
      {
        headers: { ...(req.headers || {}), host: undefined },
        timeout: 10000,
      }
    );
    return res.status(resp.status).json(resp.data);
  } catch (e) {
    console.error(
      "[route-alias-forward] POST /api/betslip/:id/watch forward failed",
      e?.message || e
    );
    if (e.response) return res.status(e.response.status).send(e.response.data);
    return res.status(500).json({ error: "forward failed" });
  }
});

app.delete("/api/betslip/:id/watch", async (req, res) => {
  try {
    const { id } = req.params;
    const base = process.env.PUBLIC_API_URL || `http://localhost:${PORT}`;
    console.log(
      `[route-alias-forward] forwarding DELETE /api/betslip/${id}/watch -> ${base}/api/betslips/${id}/watch`
    );
    const resp = await axios.delete(
      `${base.replace(/\/$/, "")}/api/betslips/${id}/watch`,
      {
        headers: { ...(req.headers || {}), host: undefined },
        timeout: 10000,
      }
    );
    return res.status(resp.status).json(resp.data);
  } catch (e) {
    console.error(
      "[route-alias-forward] DELETE /api/betslip/:id/watch forward failed",
      e?.message || e
    );
    if (e.response) return res.status(e.response.status).send(e.response.data);
    return res.status(500).json({ error: "forward failed" });
  }
});

// Data cache
let scoreboardData = null;
let summaryDataCache = {}; // { eventId: data }
let rosterGamelogCache = {}; // { teamId: { roster, gamelogs } }

// Configuration
const ESPN_BASE_URL =
  "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
const ESPN_WEB_API_URL =
  "https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba";
// Prefer using the transformed internal summary endpoint when available
const PUBLIC_API_URL =
  "https://laraiyeogithubio-production-f5af.up.railway.app";

// Scheduling state
let currentScoreboardInterval = null;
let currentSummaryIntervals = {}; // { eventId: intervalId }
let isAnyGameLive = false;
let nextGameStartTime = null;
let currentPollingMode = "slow"; // 'slow', 'moderate', 'fast'
let rostersScoreboardInterval = null; // Dedicated 30-minute refresh for /api/rosters
// Track last broadcasted state per event to avoid duplicate start/end broadcasts
const eventBroadcastState = {}; // { [eventId]: 'pre'|'in'|'post' }
// Realtime fallback polling state
let realtimeFallbackInterval = null;
let lastBetslipPollTimestamp = null;

// Helper functions
function getTimeDifferenceInMinutes(date1, date2) {
  return Math.abs(date2 - date1) / (1000 * 60);
}

function getPSTTime() {
  const now = new Date();
  // Convert to PST (UTC-8)
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const pstTime = new Date(utc + 3600000 * -8);
  return pstTime;
}

function getScoreboardDate() {
  const pstTime = getPSTTime();
  const hour = pstTime.getHours();

  // If before 2am PST, use previous day
  if (hour < 2) {
    pstTime.setDate(pstTime.getDate() - 1);
  }

  // Format as YYYYMMDD
  const year = pstTime.getFullYear();
  const month = String(pstTime.getMonth() + 1).padStart(2, "0");
  const day = String(pstTime.getDate()).padStart(2, "0");

  return `${year}${month}${day}`;
}

function isGameLive(status) {
  return status?.type?.state === "in";
}

function isGameScheduled(status) {
  return status?.type?.state === "pre";
}

function findNextGameStart(events) {
  const now = new Date();
  const upcomingGames = events
    .filter((event) => {
      const gameDate = new Date(event.date);
      const status = event.competitions?.[0]?.status;
      return gameDate > now && isGameScheduled(status);
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  return upcomingGames.length > 0 ? new Date(upcomingGames[0].date) : null;
}

// Helper function to capitalize slug
function capitalizeSlug(slug) {
  if (!slug) return slug;
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Helper function to transform statistics array to object
function transformStatistics(statsArray) {
  if (!statsArray || !Array.isArray(statsArray)) return {};

  const statsObj = {};
  statsArray.forEach((stat) => {
    if (stat.label && stat.displayValue) {
      statsObj[stat.label] = stat.displayValue;
    }
  });
  return statsObj;
}

// Helper function to transform linescores array to object
function transformLinescores(linescoresArray) {
  if (!linescoresArray || !Array.isArray(linescoresArray)) return {};

  const linescoresObj = {};
  linescoresArray.forEach((score, index) => {
    // Use period if available, otherwise generate from index
    const period = score.period || index + 1;
    const value = score.displayValue !== undefined ? score.displayValue : score;
    linescoresObj[period] = value;
  });
  return linescoresObj;
}

// Data transformation functions
function transformScoreboardData(data) {
  if (!data || !data.events) return null;

  return {
    events: data.events.map((event) => ({
      id: event.id,
      date: event.date,
      name: event.name,
      shortName: event.shortName,
      season: {
        ...event.season,
        slug: capitalizeSlug(event.season?.slug),
      },
      competitions: event.competitions?.map((comp) => ({
        venue: comp.venue,
        competitors: comp.competitors?.map((competitor) => ({
          homeAway: competitor.homeAway,
          winner: competitor.winner,
          team: {
            id: competitor.team?.id,
            abbreviation: competitor.team?.abbreviation,
            displayName: competitor.team?.displayName,
            color: competitor.team?.color,
            alternateColor: competitor.team?.alternateColor,
          },
          score: competitor.score,
          linescores: transformLinescores(competitor.linescores),
          statistics: transformStatistics(competitor.statistics),
          record: competitor.records?.[0]?.summary || null,
        })),
        notes: comp.notes,
      })),
      status: {
        displayClock: event.status?.displayClock,
        period: event.status?.period,
        type: {
          state: event.status?.type?.state,
          completed: event.status?.type?.completed,
          detail: event.status?.type?.detail,
          shortDetail: event.status?.type?.shortDetail,
        },
      },
    })),
  };
}

// Helper function to get team abbreviation from ID in scoreboard data
function getTeamAbbreviationById(teamId) {
  if (!scoreboardData?.events) return teamId;

  for (const event of scoreboardData.events) {
    const competitors = event.competitions?.[0]?.competitors || [];
    for (const competitor of competitors) {
      if (competitor.team?.id === teamId) {
        return competitor.team.abbreviation;
      }
    }
  }
  return teamId;
}

// Helper function to transform player stats with labels
function transformPlayerStats(statsArray, labels) {
  if (
    !statsArray ||
    !labels ||
    !Array.isArray(statsArray) ||
    !Array.isArray(labels)
  )
    return {};

  const statsObj = {};
  statsArray.forEach((stat, index) => {
    if (labels[index]) {
      statsObj[labels[index]] = stat;
    }
  });
  return statsObj;
}

// Helper function to calculate odds based on probability
function calculateOdds(probability) {
  if (probability >= 0.95) return -2000;
  if (probability >= 0.9) return -900;
  if (probability >= 0.85) return -567;
  if (probability >= 0.8) return -400;
  if (probability >= 0.75) return -300;
  if (probability >= 0.7) return -233;
  if (probability >= 0.65) return -186;
  if (probability >= 0.6) return -150;
  if (probability >= 0.55) return -122;
  if (probability >= 0.5) return -100;
  if (probability >= 0.45) return +122;
  if (probability >= 0.4) return +150;
  if (probability >= 0.35) return +186;
  if (probability >= 0.3) return +233;
  if (probability >= 0.25) return +300;
  if (probability >= 0.2) return +400;
  if (probability >= 0.15) return +567;
  return +900;
}

// Helper function to generate betting odds for a player
function generatePlayerOdds(gamelog, opponentTeamData) {
  if (!gamelog || !gamelog.seasonTypes) return null;

  const labels = gamelog.labels || [];
  const seasonTypes = gamelog.seasonTypes || [];
  const events = gamelog.events || {};

  // Collect all stats for each category with opponent info. Instead of
  // pushing plain values, record the event's date so we can sort by
  // gameDate (oldest -> newest) and then compute last 5/10 using the same
  // recent-game selection logic used for `recentGames`.
  const allStatsEntries = {};
  const opponentStats = {}; // Track stats against specific opponents (values only)
  labels.forEach((label) => {
    allStatsEntries[label] = [];
    opponentStats[label] = {};
  });

  // Extract all event stats
  seasonTypes.forEach((seasonType) => {
    const categories = seasonType.categories || [];
    categories.forEach((category) => {
      const categoryEvents = category.events || [];
      categoryEvents.forEach((eventData) => {
        const stats = eventData.stats || [];
        const eventId = eventData.eventId;
        const opponent = events[eventId]?.opponent;
        const gameDate = events[eventId]?.gameDate || null;

        labels.forEach((label, index) => {
          if (stats[index] !== undefined && stats[index] !== null) {
            // Parse numeric values (handle formats like "10-20")
            const value = parseFloat(String(stats[index]).split("-")[0]);
            if (!isNaN(value)) {
              allStatsEntries[label].push({
                value,
                eventId,
                gameDate,
              });

              // Track opponent-specific stats (values only)
              if (opponent?.id) {
                if (!opponentStats[label][opponent.id]) {
                  opponentStats[label][opponent.id] = [];
                }
                opponentStats[label][opponent.id].push(value);
              }
            }
          }
        });
      });
    });
  });

  // Convert entries into ordered numeric arrays (oldest -> newest)
  const allStats = {};
  labels.forEach((label) => {
    const entries = allStatsEntries[label] || [];
    entries.sort((a, b) => new Date(a.gameDate) - new Date(b.gameDate));
    allStats[label] = entries.map((e) => e.value);
  });

  // Calculate PRA (Points + Rebounds + Assists)
  const ptsValues = allStats["PTS"] || [];
  const rebValues = allStats["REB"] || [];
  const astValues = allStats["AST"] || [];

  const praValues = [];
  const minLength = Math.min(
    ptsValues.length,
    rebValues.length,
    astValues.length
  );
  for (let i = 0; i < minLength; i++) {
    praValues.push(ptsValues[i] + rebValues[i] + astValues[i]);
  }
  allStats["PRA"] = praValues;

  // Calculate stats for key betting categories
  const bettingCategories = ["PTS", "REB", "AST", "BLK", "TO", "PRA"];
  const odds = {
    milestones: {},
    overUnder: {},
  };

  bettingCategories.forEach((category) => {
    const values = allStats[category] || [];
    if (values.length === 0) return;

    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const max = Math.max(...values);
    const min = Math.min(...values);

    // Over/Under lines - always end in .5
    const overLine = Math.floor(avg) + 0.5;

    // Calculate hit counts for different time periods
    const last5 = values.slice(-5);
    const last10 = values.slice(-10);
    const seasonTotal = values.length;

    const over5 = last5.filter((v) => v > overLine).length;
    const over10 = last10.filter((v) => v > overLine).length;
    const overSeason = values.filter((v) => v > overLine).length;

    const under5 = last5.filter((v) => v < overLine).length;
    const under10 = last10.filter((v) => v < overLine).length;
    const underSeason = values.filter((v) => v < overLine).length;

    // H2H stats against today's opponent
    let overH2h = null;
    let underH2h = null;
    let h2hTotal = 0;
    if (
      opponentTeamData?.id &&
      opponentStats[category]?.[opponentTeamData.id]
    ) {
      const h2hValues = opponentStats[category][opponentTeamData.id];
      h2hTotal = h2hValues.length;
      overH2h = h2hValues.filter((v) => v > overLine).length;
      underH2h = h2hValues.filter((v) => v < overLine).length;
    }

    // Calculate confidence with refined weighting
    // Tier 1: Last 5 games (40% weight - most recent form)
    const last5Total = Math.min(5, values.length);
    const last5OverRate = last5Total > 0 ? over5 / last5Total : 0;
    const last5UnderRate = last5Total > 0 ? under5 / last5Total : 0;

    // Tier 2: Last 10 games and H2H (30% weight - medium-term trends)
    const last10Total = Math.min(10, values.length);
    const last10OverRate = last10Total > 0 ? over10 / last10Total : 0;
    const last10UnderRate = last10Total > 0 ? under10 / last10Total : 0;

    // H2H contribution (only if games exist)
    const h2hOverRate = h2hTotal > 0 ? overH2h / h2hTotal : null;
    const h2hUnderRate = h2hTotal > 0 ? underH2h / h2hTotal : null;

    // Blend last 10 and H2H (if H2H exists, use 50/50 split, otherwise just last 10)
    const tier2OverRate =
      h2hOverRate !== null
        ? last10OverRate * 0.5 + h2hOverRate * 0.5
        : last10OverRate;
    const tier2UnderRate =
      h2hUnderRate !== null
        ? last10UnderRate * 0.5 + h2hUnderRate * 0.5
        : last10UnderRate;

    // Tier 3: Season stats (30% weight, scaled by games played reliability)
    const seasonOverRate = seasonTotal > 0 ? overSeason / seasonTotal : 0;
    const seasonUnderRate = seasonTotal > 0 ? underSeason / seasonTotal : 0;

    // Scale season weight by games played (more games = more reliable)
    // Full weight at 41+ games (half season), scales down for fewer games
    const seasonReliability = Math.min(1, seasonTotal / 41);
    const seasonWeight = 0.3 * seasonReliability;

    // Redistribute any unused season weight to recent games
    const unusedWeight = 0.3 - seasonWeight;
    const adjustedTier1Weight = 0.4 + unusedWeight * 0.6; // Give most unused weight to last 5
    const adjustedTier2Weight = 0.3 + unusedWeight * 0.4; // Give some to last 10/H2H

    // Calculate final confidence (to 1 decimal point)
    const overConfidence = parseFloat(
      (
        (last5OverRate * adjustedTier1Weight +
          tier2OverRate * adjustedTier2Weight +
          seasonOverRate * seasonWeight) *
        100
      ).toFixed(1)
    );
    const underConfidence = parseFloat(
      (
        (last5UnderRate * adjustedTier1Weight +
          tier2UnderRate * adjustedTier2Weight +
          seasonUnderRate * seasonWeight) *
        100
      ).toFixed(1)
    );

    odds.overUnder[category] = {
      line: overLine,
      over: calculateOdds(overConfidence / 100),
      under: calculateOdds(underConfidence / 100),
      o5: (last5OverRate * 100).toFixed(1),
      o10: (last10OverRate * 100).toFixed(1),
      oSeason: (seasonOverRate * 100).toFixed(1),
      oH2h: h2hOverRate !== null ? (h2hOverRate * 100).toFixed(1) : null,
      oConfidence: overConfidence,
      u5: (last5UnderRate * 100).toFixed(1),
      u10: (last10UnderRate * 100).toFixed(1),
      uSeason: (seasonUnderRate * 100).toFixed(1),
      uH2h: h2hUnderRate !== null ? (h2hUnderRate * 100).toFixed(1) : null,
      uConfidence: underConfidence,
    };

    // Milestones - increment by 5 for PTS and PRA, by 1 for others
    const milestones = [];
    const increment = category === "PTS" || category === "PRA" ? 5 : 1;
    const range = max - min;

    // Generate milestone tiers
    if (range > 0) {
      let threshold = Math.floor(min);
      if (threshold < 0) threshold = 0;

      // Round to nearest increment
      threshold = Math.ceil(threshold / increment) * increment;

      while (threshold <= max && milestones.length < 8) {
        if (threshold > 0) {
          const countAbove = values.filter((v) => v >= threshold).length;
          const probability = countAbove / values.length;
          const oddValue = calculateOdds(probability);
          milestones.push(`${threshold}+:${oddValue}`);
        }
        threshold += increment;
      }
    }

    odds.milestones[category] = milestones.join(", ");
  });

  return odds;
}

// Data transformation function for summary
function transformSummaryData(data) {
  if (!data) return null;

  const transformed = {};

  // Boxscore - teams
  if (data.boxscore?.teams) {
    transformed.boxscore = {
      teams: data.boxscore.teams.map((teamData) => ({
        team: {
          id: teamData.team?.id,
          abbreviation: teamData.team?.abbreviation,
          displayName: teamData.team?.displayName,
          shortDisplayName: teamData.team?.shortDisplayName,
          color: teamData.team?.color,
          alternateColor: teamData.team?.alternateColor,
        },
        statistics: transformStatistics(teamData.statistics),
        homeAway: teamData.homeAway,
      })),
    };

    // Boxscore - players
    if (data.boxscore?.players) {
      transformed.boxscore.players = data.boxscore.players.map((playerTeam) => {
        const stats = playerTeam.statistics?.[0];
        return {
          team: {
            id: playerTeam.team?.id,
            abbreviation: playerTeam.team?.abbreviation,
            displayName: playerTeam.team?.displayName,
          },
          statistics: stats
            ? {
                athletes: stats.athletes?.map((athleteData) => ({
                  active: athleteData.active,
                  athlete: {
                    id: athleteData.athlete?.id,
                    displayName: athleteData.athlete?.displayName,
                    shortName: athleteData.athlete?.shortName,
                    jersey: athleteData.athlete?.jersey,
                    position: athleteData.athlete?.position?.abbreviation,
                  },
                  starter: athleteData.starter,
                  stats: transformPlayerStats(athleteData.stats, stats.labels),
                })),
              }
            : {},
        };
      });
    }
  }

  // Build a quick lookup map athleteId -> displayName from the transformed boxscore
  const athleteNameById = {};
  try {
    if (transformed.boxscore && Array.isArray(transformed.boxscore.players)) {
      for (const teamBlock of transformed.boxscore.players) {
        const athletes = teamBlock.statistics?.athletes || [];
        for (const a of athletes) {
          const id = a?.athlete?.id;
          const name = a?.athlete?.displayName || a?.athlete?.shortName || null;
          if (id) athleteNameById[String(id)] = name;
        }
      }
    }
  } catch (e) {
    // Non-fatal - lookup map is best-effort
    console.warn("transformSummaryData: failed to build athleteNameById map", e?.message || e);
  }

  // GameInfo - venue only
  if (data.gameInfo?.venue) {
    transformed.gameInfo = {
      venue: data.gameInfo.venue.fullName,
    };
  }

  // LastFiveGames
  if (data.lastFiveGames) {
    transformed.lastFiveGames = data.lastFiveGames.map((teamGames) => ({
      team: {
        id: teamGames.team?.id,
        displayName: teamGames.team?.displayName,
        abbreviation: teamGames.team?.abbreviation,
      },
      events: teamGames.events?.map((event) => ({
        id: event.id,
        opponent: event.opponent?.displayName,
        opponentAbbreviation: event.opponent?.abbreviation,
        atVs: event.atVs,
        date: event.gameDate,
        score: event.score,
        result: event.gameResult,
      })),
    }));
  }

  // Injuries
  if (data.injuries) {
    transformed.injuries = data.injuries.map((teamInjury) => ({
      team: {
        id: teamInjury.team?.id,
        displayName: teamInjury.team?.displayName,
        abbreviation: teamInjury.team?.abbreviation,
      },
      injuries: teamInjury.injuries?.map((injury) => ({
        [injury.athlete?.id]: injury.athlete?.displayName,
      })),
    }));
  }

  // Pickcenter
  if (data.pickcenter && data.pickcenter.length > 0) {
    const pick = data.pickcenter[0];
    transformed.pickcenter = {
      details: pick.details,
      overUnder: pick.overUnder,
      spread: pick.spread,
      overOdds: pick.overOdds,
      underOdds: pick.underOdds,
      moneyline: {
        home: {
          line: pick.homeTeamOdds?.moneyLine,
          odds: pick.homeTeamOdds?.moneyLine,
        },
        away: {
          line: pick.awayTeamOdds?.moneyLine,
          odds: pick.awayTeamOdds?.moneyLine,
        },
      },
      pointSpread: {
        home: {
          line: pick.spread,
          odds: pick.homeTeamOdds?.spreadOdds,
        },
        away: {
          line: pick.spread ? -pick.spread : null,
          odds: pick.awayTeamOdds?.spreadOdds,
        },
      },
      total: {
        over: {
          home: {
            line: pick.overUnder,
            odds: pick.overOdds,
          },
          away: {
            line: pick.overUnder,
            odds: pick.overOdds,
          },
        },
        under: {
          home: {
            line: pick.overUnder,
            odds: pick.underOdds,
          },
          away: {
            line: pick.overUnder,
            odds: pick.underOdds,
          },
        },
      },
    };
  }

  // WinProbability
  if (data.winprobability && data.winprobability.length > 0) {
    transformed.winprobability = data.winprobability.map(
      (wp) => wp.homeWinPercentage
    );
  }

  // Predictor
  if (data.predictor?.homeTeam) {
    transformed.predictor = {
      homeTeam: {
        id: data.predictor.homeTeam.id,
        WIN: data.predictor.homeTeam.gameProjection,
        LOSS: data.predictor.homeTeam.teamChanceLoss,
      },
    };
  }

  // Plays - only last entry
  if (data.plays && data.plays.length > 0) {
    const lastPlay = data.plays[data.plays.length - 5]; // Get the 5th last play for better relevance
    const participants = {};

    if (lastPlay.participants) {
      lastPlay.participants.forEach((p, idx) => {
        const aid = p?.athlete?.id || p?.athlete?.externalId || null;
        const key = aid != null ? String(aid) : null;
        const nameFromBox = key ? athleteNameById[key] : null;
        const displayName = p?.athlete?.displayName || nameFromBox || null;
        if (key) {
          participants[`athlete${idx + 1}`] = { [key]: displayName };
        } else {
          participants[`athlete${idx + 1}`] = {};
        }
      });
    }

    transformed.plays = {
      id: lastPlay.id,
      type: lastPlay.type?.text,
      text: lastPlay.text,
      period: {
        number: lastPlay.period?.number,
        displayValue: lastPlay.period?.displayValue,
      },
      clock: lastPlay.clock?.displayValue,
      scoringPlay: lastPlay.scoringPlay,
      scoreValue: lastPlay.scoreValue,
      team: getTeamAbbreviationById(lastPlay.team?.id),
      participants,
      shootingPlay: lastPlay.shootingPlay,
      coordinate: {
        x:
          lastPlay.coordinate?.x > 100 || lastPlay.coordinate?.x < -100
            ? 0
            : lastPlay.coordinate?.x,
        y:
          lastPlay.coordinate?.y > 100 || lastPlay.coordinate?.y < -100
            ? 0
            : lastPlay.coordinate?.y,
      },
      pointsAttempted: lastPlay.pointsAttempted,
      shortDescription: lastPlay.shortDescription,
    };
  }

  // Header
  if (data.header) {
    transformed.header = {
      id: data.header.id,
      season: data.header.season,
      gameNote: data.header.gameNote,
      competitions: data.header.competitions?.map((comp) => ({
        date: comp.date,
        competitors: comp.competitors?.map((competitor) => ({
          homeAway: competitor.homeAway,
          winner: competitor.winner,
          team: {
            id: competitor.team?.id,
            abbreviation: competitor.team?.abbreviation,
            displayName: competitor.team?.displayName,
            color: competitor.team?.color,
            alternateColor: competitor.team?.alternateColor,
          },
          score: competitor.score,
          linescores: transformLinescores(competitor.linescores),
          record: competitor.record?.[0]?.summary || null,
        })),
        status: {
          displayClock: comp.status?.displayClock,
          period: comp.status?.period,
          type: {
            state: comp.status?.type?.state,
            completed: comp.status?.type?.completed,
            detail: comp.status?.type?.detail,
            shortDetail: comp.status?.type?.shortDetail,
          },
        },
      })),
    };
  }

  return transformed;
}

// Transform rosters data
function transformRostersData(rostersData) {
  if (!rostersData || !rostersData.teams) {
    return { teams: [] };
  }

  const teams = rostersData.teams.map((teamData) => {
    const { team, roster, gamelogs, opponentId } = teamData;

    // Filter athletes - exclude those with injuries
    const healthyAthletes = (roster?.athletes || []).filter((athlete) => {
      return !athlete.injuries || athlete.injuries.length === 0;
    });

    const athletes = healthyAthletes.map((athlete) => {
      const gamelog = gamelogs[athlete.id];

      // Base athlete info
      const athleteData = {
        id: athlete.id,
        name: `${athlete.firstName} ${athlete.lastName}`,
        shortName: athlete.shortName,
        jersey: athlete.jersey,
        position: athlete.position?.abbreviation || null,
      };

      // Add gamelog data if available
      if (gamelog) {
        const labels = gamelog.labels || [];
        const events = gamelog.events || {};
        const seasonTypes = gamelog.seasonTypes || [];

        // Normalize events into an array, sort by gameDate descending (newest first),
        // then take the first 5 for recent games. This ensures we pick the most
        // recent matches regardless of the original object/array ordering from ESPN.
        const allEventsArray = Array.isArray(events)
          ? events.slice()
          : Object.values(events || {});
        const sortedEvents = allEventsArray.sort(
          (a, b) => new Date(b.gameDate) - new Date(a.gameDate)
        );
        const recentEvents = sortedEvents.slice(0, 5);

        // Build a map of eventId to stats for all events present in the gamelog
        // so we can fall back to later events when some recent events lack stats.
        const eventStatsMap = {};
        const sortedEventIds = sortedEvents.map((e) => e.id);
        sortedEventIds.forEach((eventId) => {
          seasonTypes.forEach((seasonType) => {
            const categories = seasonType.categories || [];
            categories.forEach((category) => {
              const categoryEvents = category.events || [];
              categoryEvents.forEach((eventData) => {
                if (eventData.eventId === eventId) {
                  const stats = eventData.stats || [];
                  const formattedStats = {};
                  labels.forEach((label, index) => {
                    if (stats[index] !== undefined) {
                      formattedStats[label] = stats[index];
                    }
                  });
                  eventStatsMap[eventId] = formattedStats;
                }
              });
            });
          });
        });

        // Create recentGames using only events that have stats available.
        // If a recent event has null/missing stats, skip it and use the
        // next-most-recent event that does have stats so the list reflects
        // the player's last N games with stats.
        const recentWithStats = [];
        for (const ev of sortedEvents) {
          if (recentWithStats.length >= 5) break;
          const statsForEv = eventStatsMap[ev.id];
          if (statsForEv && Object.keys(statsForEv).length > 0) {
            recentWithStats.push({ event: ev, stats: statsForEv });
          }
        }

        const recentGames = recentWithStats.map(({ event, stats }) => ({
          atVs: event.atVs,
          gameDate: event.gameDate,
          score: event.score,
          opponent: {
            id: event.opponent?.id || null,
            displayName: event.opponent?.displayName || null,
            abbreviation: event.opponent?.abbreviation || null,
          },
          stats: stats,
        }));

        // Get averages from summary
        let averages = null;
        seasonTypes.forEach((seasonType) => {
          if (seasonType.summary && seasonType.summary.stats) {
            const summaryStats = seasonType.summary.stats;
            summaryStats.forEach((summaryItem) => {
              if (summaryItem.displayName === "Averages") {
                const stats = summaryItem.stats || [];
                const formattedAverages = {};
                labels.forEach((label, index) => {
                  if (stats[index] !== undefined) {
                    formattedAverages[label] = stats[index];
                  }
                });

                // Calculate PRA average
                const ptsAvg = parseFloat(formattedAverages["PTS"]) || 0;
                const rebAvg = parseFloat(formattedAverages["REB"]) || 0;
                const astAvg = parseFloat(formattedAverages["AST"]) || 0;
                formattedAverages["PRA"] = (ptsAvg + rebAvg + astAvg).toFixed(
                  1
                );

                averages = formattedAverages;
              }
            });
          }
        });

        athleteData.recentGames = recentGames;
        athleteData.averages = averages;
        // Pass opponent ID to odds generation
        athleteData.odds = generatePlayerOdds(
          gamelog,
          opponentId ? { id: opponentId } : null
        );
      }

      return athleteData;
    });

    return {
      id: team.id,
      abbreviation: team.abbreviation,
      displayName: team.displayName,
      color: team.color,
      athletes,
    };
  });

  return { teams };
}

// Fetch functions
async function fetchScoreboard() {
  try {
    const dateParam = getScoreboardDate();
    const response = await axios.get(
      `${ESPN_BASE_URL}/scoreboard?dates=${dateParam}`
    );
    scoreboardData = response.data;

    // Check game statuses and update scheduling
    updateSchedulingLogic();

    return scoreboardData;
  } catch (error) {
    console.error("[Scoreboard] Error fetching data:", error.message);
    return null;
  }
}

async function fetchSummary(eventId) {
  try {
    const response = await axios.get(
      `${ESPN_BASE_URL}/summary?event=${eventId}`
    );
    response.data.lastPolledTime = new Date();
    summaryDataCache[eventId] = response.data;
    return response.data;
  } catch (error) {
    console.error(
      `[Summary] Error fetching data for event ${eventId}:`,
      error.message
    );
    return null;
  }
}

async function fetchTeamRoster(teamId) {
  try {
    console.log(`[Roster] Fetching data for team ${teamId}...`);
    const response = await axios.get(`${ESPN_BASE_URL}/teams/${teamId}/roster`);
    console.log(`[Roster] Data fetched successfully for team ${teamId}`);
    return response.data;
  } catch (error) {
    console.error(
      `[Roster] Error fetching data for team ${teamId}:`,
      error.message
    );
    return null;
  }
}

async function fetchAthleteGamelog(athleteId) {
  try {
    console.log(`[Gamelog] Fetching data for athlete ${athleteId}...`);
    const response = await axios.get(
      `${ESPN_WEB_API_URL}/athletes/${athleteId}/gamelog`
    );
    console.log(`[Gamelog] Data fetched successfully for athlete ${athleteId}`);
    return response.data;
  } catch (error) {
    console.error(
      `[Gamelog] Error fetching data for athlete ${athleteId}:`,
      error.message
    );
    return null;
  }
}

async function fetchRosterAndGamelogs(teamId, opponentId = null) {
  try {
    console.log(
      `[Roster+Gamelog] Fetching combined data for team ${teamId}...`
    );

    // Fetch roster
    const roster = await fetchTeamRoster(teamId);
    if (!roster) {
      throw new Error("Failed to fetch roster");
    }

    // Filter out injured athletes
    const healthyAthletes = (roster.athletes || []).filter((athlete) => {
      return !athlete.injuries || athlete.injuries.length === 0;
    });

    const gamelogs = {};

    // Fetch gamelogs only for healthy athletes
    const gamelogPromises = healthyAthletes.map(async (athlete) => {
      const gamelog = await fetchAthleteGamelog(athlete.id);
      if (gamelog) {
        gamelogs[athlete.id] = gamelog;
      }
    });

    await Promise.all(gamelogPromises);

    const combinedData = {
      team: roster.team,
      roster,
      gamelogs,
      opponentId, // Pass opponent ID through
      lastUpdated: new Date().toISOString(),
    };

    rosterGamelogCache[teamId] = combinedData;
    console.log(
      `[Roster+Gamelog] Combined data fetched successfully for team ${teamId}`
    );

    return combinedData;
  } catch (error) {
    console.error(
      `[Roster+Gamelog] Error fetching combined data for team ${teamId}:`,
      error.message
    );
    return null;
  }
}

async function fetchAllRostersAndGamelogs() {
  try {
    console.log("[Rosters] Fetching all rosters and gamelogs...");

    // Fetch scoreboard if not available
    if (!scoreboardData || !scoreboardData.events) {
      await fetchScoreboard();
    }

    if (!scoreboardData?.events) {
      throw new Error("No scoreboard data available");
    }

    // Extract unique team IDs from scoreboard and build opponent map
    const teamIds = new Set();
    const opponentMap = {}; // teamId -> opponentTeamId

    // Only include teams for events that are scheduled (pre-game)
    scoreboardData.events.forEach((event) => {
      const state = event.competitions?.[0]?.status?.type?.state;
      if (state !== "pre") return; // skip non-scheduled games

      const competitors = event.competitions?.[0]?.competitors || [];
      competitors.forEach((competitor) => {
        teamIds.add(competitor.team.id);
      });

      // Build opponent relationships (each team plays against the other)
      if (competitors.length === 2) {
        const team1Id = competitors[0].team.id;
        const team2Id = competitors[1].team.id;
        opponentMap[team1Id] = team2Id;
        opponentMap[team2Id] = team1Id;
      }
    });

    console.log(`[Rosters] Found ${teamIds.size} teams to fetch`);

    // Fetch roster and gamelogs for each team with opponent info
    const teamsData = [];
    for (const teamId of teamIds) {
      const opponentId = opponentMap[teamId];
      const teamData = await fetchRosterAndGamelogs(teamId, opponentId);
      if (teamData) {
        teamsData.push(teamData);
      }
    }

    const combinedData = {
      teams: teamsData,
      lastUpdated: new Date().toISOString(),
    };

    // Store in cache with special key
    rosterGamelogCache["all"] = combinedData;
    console.log(`[Rosters] All rosters and gamelogs fetched successfully`);

    return combinedData;
  } catch (error) {
    console.error(
      "[Rosters] Error fetching all rosters and gamelogs:",
      error.message
    );
    return null;
  }
}

// Scheduling logic
function updateSchedulingLogic() {
  if (!scoreboardData?.events) return;

  const events = scoreboardData.events;
  let hasLiveGames = false;
  let hasScheduledGames = false;
  const now = new Date();

  // Check if any games are live or scheduled
  for (const event of events) {
    const status = event.competitions?.[0]?.status;
    if (isGameLive(status)) {
      hasLiveGames = true;
      break;
    }
    if (isGameScheduled(status)) {
      hasScheduledGames = true;
    }
  }

  // Find next game start time
  const nextGameTime = findNextGameStart(events);
  nextGameStartTime = nextGameTime;

  // Determine polling mode
  let newPollingMode = "slow";

  if (hasLiveGames) {
    // Fast polling: games are live
    newPollingMode = "fast";
  } else if (nextGameTime) {
    const minutesUntilStart = getTimeDifferenceInMinutes(now, nextGameTime);
    if (minutesUntilStart <= 5) {
      // Fast polling: game starting within 5 minutes
      newPollingMode = "fast";
    } else if (hasScheduledGames) {
      // Moderate polling: games scheduled today but not imminent
      newPollingMode = "moderate";
    }
  }

  // Update scoreboard fetching interval if mode changed
  if (newPollingMode !== currentPollingMode) {
    if (newPollingMode === "fast") {
      console.log(
        "[Scheduler] Live games or game starting soon detected. Switching to 2-second interval."
      );
      startScoreboardFastPolling();
    } else if (newPollingMode === "moderate") {
      console.log(
        "[Scheduler] Scheduled games detected. Switching to 90-second interval."
      );
      startScoreboardModeratePolling();
    } else {
      console.log(
        "[Scheduler] No live or upcoming games. Switching to 30-minute interval."
      );
      startScoreboardSlowPolling();
    }
    currentPollingMode = newPollingMode;
  }

  isAnyGameLive = hasLiveGames;

  // Update summary fetching for each event
  updateSummaryScheduling(events);
}

function startScoreboardFastPolling() {
  if (currentScoreboardInterval) {
    clearInterval(currentScoreboardInterval);
  }
  console.log("[Polling] Switching to FAST polling (2 seconds)");
  currentScoreboardInterval = setInterval(fetchScoreboard, 2000); // Every 2 seconds
}

function startScoreboardModeratePolling() {
  if (currentScoreboardInterval) {
    clearInterval(currentScoreboardInterval);
  }
  console.log("[Polling] Switching to MODERATE polling (90 seconds)");
  currentScoreboardInterval = setInterval(fetchScoreboard, 90 * 1000); // Every 90 seconds
}

function startScoreboardSlowPolling() {
  if (currentScoreboardInterval) {
    clearInterval(currentScoreboardInterval);
  }
  console.log("[Polling] Switching to SLOW polling (30 minutes)");
  currentScoreboardInterval = setInterval(fetchScoreboard, 30 * 60 * 1000); // Every 30 minutes
}

function updateSummaryScheduling(events) {
  const now = new Date();

  for (const event of events) {
    const eventId = event.id;
    const status = event.competitions?.[0]?.status;
    const gameDate = new Date(event.date);

    const isLive = isGameLive(status);
    const isPost = status?.type?.state === "post";
    const minutesUntilStart = getTimeDifferenceInMinutes(now, gameDate);

    // Fast poll if: game is live, starting in 5 minutes, or ended within last 5 minutes
    let shouldFastPoll =
      isLive || (minutesUntilStart <= 5 && minutesUntilStart >= 0);

    // If game is post, check if it ended within the last 5 minutes
    // We'll use the last update time from cache if available
    if (isPost && summaryDataCache[eventId]) {
      const lastUpdate = summaryDataCache[eventId].lastPolledTime || now;
      const minutesSinceEnd = getTimeDifferenceInMinutes(lastUpdate, now);
      if (minutesSinceEnd <= 5) {
        shouldFastPoll = true;
      }
    }

    // Check if we need to update the interval for this event
    const hasInterval = currentSummaryIntervals[eventId];

    if (shouldFastPoll && !hasInterval) {
      currentSummaryIntervals[eventId] = setInterval(
        () => fetchSummary(eventId),
        2000
      );
    } else if (!shouldFastPoll && hasInterval) {
      console.log(
        `[Summary Scheduler] Stopping fast polling for event ${eventId}`
      );
      clearInterval(currentSummaryIntervals[eventId]);
      delete currentSummaryIntervals[eventId];
    }
  }
}

// Daily roster/gamelog update at 2:00 AM PST
cron.schedule(
  "0 2 * * *",
  async () => {
    console.log("[Cron] Running daily roster/gamelog update at 2:00 AM PST");
    await fetchAllRostersAndGamelogs();
  },
  {
    timezone: "America/Los_Angeles",
  }
);

// Game start roster/gamelog update
async function checkForGameStarts() {
  if (!scoreboardData?.events) return;

  const now = new Date();

  for (const event of scoreboardData.events) {
    const status = event.competitions?.[0]?.status;
    const gameDate = new Date(event.date);
    const minutesUntilStart = getTimeDifferenceInMinutes(now, gameDate);

    // Check if game is starting soon (within 1 minute) or just started
    if (
      (minutesUntilStart <= 1 && isGameScheduled(status)) ||
      (isGameLive(status) && minutesUntilStart <= 5)
    ) {
      // Only fetch if we haven't updated recently (within last 5 minutes)
      const cached = rosterGamelogCache["all"];
      if (
        !cached ||
        getTimeDifferenceInMinutes(now, new Date(cached.lastUpdated)) > 5
      ) {
        console.log(
          `[Game Start] Updating all rosters/gamelogs (games starting)`
        );
        await fetchAllRostersAndGamelogs();
        break; // Only fetch once per check
      }
    }
  }
}

// Check for game starts every minute
setInterval(checkForGameStarts, 60 * 1000);

// API Endpoints
app.get("/", (req, res) => {
  res.json({
    message: "NBA Data Fetcher API",
    version: "1.0.0",
    endpoints: {
      scoreboard: "/api/scoreboard",
      summary: "/api/summary/:eventId",
      rosters: "/api/rosters",
      betslip:
        "/api/betslip?gameId=:eventId&moneyline=:team&total=:bet&spread=:bet&p1=:playerId&p1_pts=:bet",
      betslipNotification:
        "/api/betslip/notification?gameId=:eventId&[same params as betslip]",
      health: "/health",
    },
    examples: {
      betslip:
        "/api/betslip?gameId=401836803&moneyline=BOS&total=o220.5&p1=4432166&p1_pts=o29.5",
      betslipNotification:
        "/api/betslip/notification?gameId=401836803&moneyline=BOS&total=o220.5&p1=4432166&p1_pts=o29.5",
      multiGame:
        "/api/betslip?gameId=401836803,401839023&moneyline=DET&p1=4432166&p1_pts=o29.5",
    },
    status: {
      isAnyGameLive,
      nextGameStart: nextGameStartTime,
      cachedEvents: Object.keys(summaryDataCache).length,
      cachedRosters: rosterGamelogCache["all"] ? "cached" : "not cached",
      pollingMode: currentPollingMode,
    },
    deployment: {
      platform: "Railway",
      customApiUrl: "https://laraiyeogithubio-production-f5af.up.railway.app",
      fallbackApi: "ESPN",
    },
  });
});

app.get("/api/scoreboard", async (req, res) => {
  try {
    if (!scoreboardData) {
      await fetchScoreboard();
    }

    // Transform and return only the filtered data
    const transformedData = transformScoreboardData(scoreboardData);
    res.json(transformedData || { error: "Failed to fetch scoreboard data" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/summary/:eventId", async (req, res) => {
  try {
    const { eventId } = req.params;

    // Check cache first
    const old = summaryDataCache[eventId];
    const newSummary = await fetchSummary(eventId);

    // If we had an old summary, compare game state transitions
    try {
      const oldState = old?.header?.competitions?.[0]?.status?.type?.state;
      const newState =
        newSummary?.header?.competitions?.[0]?.status?.type?.state;
      if (oldState && newState && oldState !== newState) {
        const comp = newSummary.header?.competitions?.[0];
        const home =
          comp?.competitors?.find((c) => c.homeAway === "home")?.team
            ?.abbreviation || "";
        const away =
          comp?.competitors?.find((c) => c.homeAway === "away")?.team
            ?.abbreviation || "";
        // Only broadcast once per transition using eventBroadcastState
        const lastBroadcast = eventBroadcastState[eventId] || null;
        if (oldState === "pre" && newState === "in" && lastBroadcast !== "in") {
          eventBroadcastState[eventId] = "in";
          // game started
        }
        if (
          oldState === "in" &&
          newState === "post" &&
          lastBroadcast !== "post"
        ) {
          eventBroadcastState[eventId] = "post";
          const homeScore =
            comp?.competitors?.find((c) => c.homeAway === "home")?.score || 0;
          const awayScore =
            comp?.competitors?.find((c) => c.homeAway === "away")?.score || 0;
        }
      }
    } catch (e) {
      console.error("Error comparing summary states", e?.message || e);
    }

    // Transform and return only the filtered data
    const transformedData = transformSummaryData(summaryDataCache[eventId]);
    res.json(transformedData || { error: "Failed to fetch summary data" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/rosters", async (req, res) => {
  try {
    // Check cache first
    if (!rosterGamelogCache["all"]) {
      await fetchAllRostersAndGamelogs();
    }

    // Transform and return the data
    const transformedData = transformRostersData(rosterGamelogCache["all"]);
    res.json(transformedData || { error: "Failed to fetch rosters data" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/betslip", async (req, res) => {
  try {
    const { moneyline, total, gameId, ...playerBets } = req.query;

    if (!gameId) {
      return res
        .status(400)
        .json({ error: "gameId is required as a query parameter" });
    }

    // Parse game IDs (can be single or comma-separated)
    const gameIds = gameId.split(",").map((id) => id.trim());
    const events = [];

    // Process each game
    for (const currentGameId of gameIds) {
      try {
        // For betslip, we need raw ESPN data (not transformed) to get boxscore.players with full structure
        // So we fetch directly from ESPN rather than using the custom API which returns transformed data
        let summaryData = null;
        try {
          const espnResponse = await axios.get(
            `${ESPN_BASE_URL}/summary?event=${currentGameId}`
          );
          summaryData = espnResponse.data;
          console.log(
            `[Betslip] Using ESPN raw data for game ${currentGameId}`
          );
          console.log(
            `[Betslip] ESPN response has boxscore: ${!!summaryData.boxscore}, has boxscore.players: ${!!summaryData
              .boxscore?.players}`
          );
        } catch (espnError) {
          console.log(
            `[Betslip] Failed to fetch from ESPN for game ${currentGameId}: ${espnError.message}`
          );
        }

        if (!summaryData) {
          console.log(`[Betslip] No data available for game ${currentGameId}`);
          continue;
        }

        // Get game status
        const gameStatus = summaryData.header?.competitions?.[0]?.status?.type;
        const isCompleted = gameStatus?.completed || false;

        const eventData = {
          eventId: currentGameId,
          status: {
            shortDetail: gameStatus?.detail,
            completed: isCompleted,
            state: gameStatus?.state,
            date: summaryData.header?.competitions?.[0]?.date || null,
            game: {
              homeTeam:
                summaryData.header?.competitions?.[0]?.competitors?.find(
                  (c) => c.homeAway === "home"
                )?.team?.abbreviation || null,
              awayTeam:
                summaryData.header?.competitions?.[0]?.competitors?.find(
                  (c) => c.homeAway === "away"
                )?.team?.abbreviation || null,
              homeScore:
                summaryData.header?.competitions?.[0]?.competitors?.find(
                  (c) => c.homeAway === "home"
                )?.score || null,
              awayScore:
                summaryData.header?.competitions?.[0]?.competitors?.find(
                  (c) => c.homeAway === "away"
                )?.score || null,
            },
          },
          bets: {},
        };

        // Get team logos from boxscore
        const boxscoreTeams = summaryData.boxscore?.teams || [];

        // Process moneyline bet
        if (moneyline) {
          const competitors =
            summaryData.header?.competitions?.[0]?.competitors || [];

          const betTeam = competitors.find(
            (c) => c.team?.abbreviation === moneyline
          );
          const opposingTeam = competitors.find(
            (c) => c.team?.abbreviation !== moneyline
          );

          if (betTeam && opposingTeam) {
            const betScore = parseInt(betTeam.score) || 0;
            const oppScore = parseInt(opposingTeam.score) || 0;
            const isWinning = betScore > oppScore;
            const isInProgress = !isCompleted && gameStatus?.state === "in";

            eventData.bets.moneyline = {
              team: moneyline,
              current: {
                score: `${betScore}-${oppScore}`,
                lead:
                  betScore > oppScore
                    ? moneyline
                    : betScore < oppScore
                    ? opposingTeam.team?.abbreviation
                    : "Tied",
                won: isCompleted
                  ? isWinning
                    ? true
                    : false
                  : isInProgress
                  ? "in progress"
                  : "pending",
              },
            };
          }
        }

        // Process total points bet
        if (total) {
          const competitors =
            summaryData.header?.competitions?.[0]?.competitors || [];
          const homeScore =
            parseInt(competitors.find((c) => c.homeAway === "home")?.score) ||
            0;
          const awayScore =
            parseInt(competitors.find((c) => c.homeAway === "away")?.score) ||
            0;
          const currentTotal = homeScore + awayScore;

          const isOver = total.startsWith("o") || total.startsWith("O");
          const line = parseFloat(total.substring(1));
          const isInProgress = !isCompleted && gameStatus?.state === "in";

          let won;
          if (isOver) {
            // Overs: consider >= as currently winning; keep existing behaviour
            const isWinning = currentTotal >= line;
            won = isCompleted
              ? isWinning
                ? true
                : false
              : isInProgress
              ? "in progress"
              : "pending";
          } else {
            // Unders: do NOT mark won while game is in progress even if current <= line.
            // If game is in progress and current <= line -> still "in progress".
            // If current > line while game is in progress -> mark as lost (false).
            if (isInProgress) {
              won = currentTotal <= line ? "in progress" : false;
            } else if (!isCompleted) {
              won = "pending";
            } else {
              // Game completed: under wins if current <= line
              const isWinning = currentTotal <= line;
              won = isWinning ? true : false;
            }
          }

          eventData.bets.totalPoints = {
            bet: total,
            line: line,
            type: isOver ? "over" : "under",
            current: currentTotal,
            won,
          };
        }

        // Process spread bet
        if (req.query.spread) {
          // Accept spread formats like "DEN+1.5", "DEN 1.5", or "DEN-1.5".
          // Express may decode '+' into a space, so normalize by preserving
          // any explicit '+' or interpreting spaces as '+' when appropriate.
          const rawSpread = String(req.query.spread || "");
          const spreadBet = rawSpread.trim();
          const competitors =
            summaryData.header?.competitions?.[0]?.competitors || [];

          // Match team (letters) then optional separator (+ or space or nothing) then signed number
          const match = spreadBet.match(/^([A-Z]+)[+\s]?([+-]?[0-9.]+)$/i);
          if (match) {
            const teamAbbr = match[1].toUpperCase();
            const rawLine = match[2];
            const spreadLine = parseFloat(rawLine);
            const lineDisplay = String(rawLine).startsWith("+")
              ? String(rawLine)
              : spreadLine > 0
              ? `+${spreadLine}`
              : `${spreadLine}`;

            const betTeam = competitors.find(
              (c) => c.team?.abbreviation === teamAbbr
            );
            const opposingTeam = competitors.find(
              (c) => c.team?.abbreviation !== teamAbbr
            );

            if (betTeam && opposingTeam) {
              const betScore = parseInt(betTeam.score) || 0;
              const oppScore = parseInt(opposingTeam.score) || 0;
              const adjustedScore = betScore + spreadLine;
              const isWinning = adjustedScore > oppScore;
              const isInProgress = !isCompleted && gameStatus?.state === "in";

              eventData.bets.spread = {
                team: teamAbbr,
                // keep numeric line for comparisons and also provide a display string
                line: spreadLine,
                lineDisplay,
                current: {
                  score: `${betScore}-${oppScore}`,
                  // carry the signed display so clients can show "+1.5"
                  adjustedScore: lineDisplay,
                  won: isCompleted
                    ? isWinning
                      ? true
                      : false
                    : isInProgress
                    ? "in progress"
                    : "pending",
                },
              };
            }
          }
        }

        // Process player bets
        const boxscorePlayers = summaryData.boxscore?.players || [];
        const players = [];

        console.log(
          `[Betslip] Boxscore players count: ${boxscorePlayers.length}`
        );

        Object.keys(playerBets).forEach((key) => {
          const playerMatch = key.match(/^p(\d+)$/);
          if (playerMatch) {
            const playerId = playerBets[key];
            console.log(`[Betslip] Looking for player ID: ${playerId}`);

            const playerData = {
              id: playerId,
              name: null,
              overUnder: {},
              milestones: {},
            };

            // Find player in boxscore
            for (const team of boxscorePlayers) {
              // Debug: Check team structure
              console.log(
                `[Betslip] Team: ${
                  team.team?.abbreviation
                }, has statistics: ${!!team.statistics}, statistics is array: ${Array.isArray(
                  team.statistics
                )}, length: ${team.statistics?.length}`
              );

              // If statistics is missing or empty, log the team structure
              if (
                !team.statistics ||
                !Array.isArray(team.statistics) ||
                team.statistics.length === 0
              ) {
                console.log(
                  `[Betslip] WARNING: Team ${team.team?.abbreviation} has no statistics array. Team keys:`,
                  Object.keys(team)
                );
                continue;
              }

              // Statistics is an array, not an object
              const statisticsData = team.statistics[0];
              if (statisticsData) {
                console.log(
                  `[Betslip] Statistics data found, has athletes: ${!!statisticsData.athletes}, athletes length: ${
                    statisticsData.athletes?.length
                  }`
                );
              }
              const athletes = statisticsData?.athletes || [];
              console.log(
                `[Betslip] Checking team: ${team.team?.abbreviation}, athletes count: ${athletes.length}`
              );

              const athlete = athletes.find((a) => a.athlete?.id === playerId);
              if (athlete) {
                console.log(
                  `[Betslip] Found player: ${athlete.athlete?.displayName}`
                );
                playerData.name = athlete.athlete?.displayName;

                // Get stat labels for mapping
                const labels = statisticsData.labels || [];

                // Process player over/under and milestone bets
                Object.keys(playerBets).forEach((betKey) => {
                  const statMatch = betKey.match(/^p(\d+)_(\w+)$/);
                  if (statMatch) {
                    const [, num, stat] = statMatch;
                    if (num === playerMatch[1]) {
                      const betValue = playerBets[betKey];
                      const statUpper = stat.toUpperCase();

                      // Find stat index in labels
                      const statIndex = labels.indexOf(statUpper);
                      // Compute current value. If the requested stat is PRA
                      // (Points+Rebounds+Assists), sum the corresponding
                      // PTS, REB and AST values from the athlete.stats array.
                      let current = 0;
                      if (statUpper === "PRA") {
                        const ptsIdx = labels.indexOf("PTS");
                        const rebIdx = labels.indexOf("REB");
                        const astIdx = labels.indexOf("AST");
                        const pts =
                          ptsIdx >= 0
                            ? parseFloat(athlete.stats?.[ptsIdx]) || 0
                            : 0;
                        const reb =
                          rebIdx >= 0
                            ? parseFloat(athlete.stats?.[rebIdx]) || 0
                            : 0;
                        const ast =
                          astIdx >= 0
                            ? parseFloat(athlete.stats?.[astIdx]) || 0
                            : 0;
                        current = pts + reb + ast;
                      } else {
                        current =
                          statIndex >= 0
                            ? parseFloat(athlete.stats?.[statIndex]) || 0
                            : 0;
                      }

                      console.log(
                        `[Betslip] Processing bet: ${betKey}, stat: ${statUpper}, current: ${current}, betValue: ${betValue}`
                      );

                      // Check if it's an over/under (contains 'o' or 'u' prefix)
                      if (betValue.match(/^[ou]/i)) {
                        const isOver =
                          betValue.startsWith("o") || betValue.startsWith("O");
                        const line = parseFloat(betValue.substring(1));
                        // Determine win state with special handling for unders
                        const isInProgress =
                          !isCompleted && gameStatus?.state === "in";
                        let won;
                        if (isOver) {
                          const isWinning = current >= line;
                          won = isCompleted
                            ? isWinning
                              ? true
                              : false
                            : isInProgress
                            ? "in progress"
                            : "pending";
                        } else {
                          // Under: while game in progress and current <= line -> still in progress
                          // If current > line while in progress -> lost (false)
                          if (isInProgress) {
                            won = current <= line ? "in progress" : false;
                          } else {
                            const isWinning = current <= line;
                            won = isWinning ? true : false;
                          }
                        }

                        playerData.overUnder[statUpper] = {
                          bet: line,
                          type: isOver ? "over" : "under",
                          current: current,
                          won,
                        };
                      }
                      // Check if it's a milestone (any number, may have + or % at the end)
                      else {
                        // Parse threshold from string (handles "5+", "5", "5%2B", etc.)
                        const threshold = parseInt(
                          betValue.replace(/[^0-9]/g, "")
                        );
                        if (!isNaN(threshold)) {
                          const isWinning = current >= threshold;
                          const isInProgress =
                            !isCompleted && gameStatus?.state === "in";

                          playerData.milestones[statUpper] = {
                            bet: betValue,
                            threshold: threshold,
                            current: current,
                            won: isWinning
                              ? true
                              : isInProgress
                              ? "in progress"
                              : !isCompleted
                              ? "pending"
                              : false,
                          };
                        }
                      }
                    }
                  }
                });

                break;
              }
            }

            // Only add player if they have bets
            if (
              Object.keys(playerData.overUnder).length > 0 ||
              Object.keys(playerData.milestones).length > 0
            ) {
              players.push(playerData);
            } else {
              console.log(`[Betslip] Player ${playerId} has no bets processed`);
            }
          }
        });

        if (players.length > 0) {
          eventData.bets.players = players;
        }

        events.push(eventData);
      } catch (gameError) {
        console.error(
          `[Betslip] Error processing game ${currentGameId}:`,
          gameError.message
        );
      }
    }

    // Calculate payload size
    const responseString = JSON.stringify(events);
    const payloadSizeBytes = Buffer.byteLength(responseString, "utf8");
    const payloadSizeKB = (payloadSizeBytes / 1024).toFixed(2);

    console.log(
      `[Betslip] Payload size: ${payloadSizeBytes} bytes (${payloadSizeKB} KB)`
    );

    // Add metadata about payload size
    const response = {
      events: events,
      metadata: {
        payloadSize: {
          bytes: payloadSizeBytes,
          kb: parseFloat(payloadSizeKB),
          withinPushLimit: payloadSizeBytes <= 4096, // FCM/APNs limit is 4KB
          recommendedForPush: payloadSizeBytes <= 3072, // Leave room for overhead
        },
        totalBets: events.reduce((sum, event) => {
          let count = 0;
          if (event.bets.moneyline) count++;
          if (event.bets.totalPoints) count++;
          if (event.bets.spread) count++;
          if (event.bets.players)
            count += event.bets.players.reduce((pSum, p) => {
              return (
                pSum +
                Object.keys(p.overUnder).length +
                Object.keys(p.milestones).length
              );
            }, 0);
          return sum + count;
        }, 0),
        gamesCount: events.length,
      },
    };

    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Backwards-compatible POST alias: allow clients to POST to /api/betslip
// (singular) to create a betslip. This proxies to the implemented plural
// handler on the local server so we don't duplicate logic.
app.post("/api/betslip", authMiddlewareInline, async (req, res) => {
  try {
    const localBase = `http://127.0.0.1:${PORT}`;
    console.log(
      `[route-alias-local] forwarding POST /api/betslip -> ${localBase}/api/betslips`
    );
    const resp = await axios.post(`${localBase}/api/betslips`, req.body || {}, {
      headers: { ...(req.headers || {}), host: undefined },
      timeout: 20000,
    });
    return res.status(resp.status).json(resp.data);
  } catch (e) {
    console.error(
      "[route-alias-local] POST /api/betslip forward failed",
      e?.message || e
    );
    if (e.response) return res.status(e.response.status).send(e.response.data);
    return res.status(500).json({ error: "forward failed" });
  }
});

app.post("/api/betslip/:id/watch", authMiddlewareInline, async (req, res) => {
  try {
    const { id } = req.params;
    const localBase = `http://127.0.0.1:${PORT}`;
    console.log(
      `[route-alias-local] forwarding POST /api/betslip/${id}/watch -> ${localBase}/api/betslips/${id}/watch`
    );
    const resp = await axios.post(
      `${localBase}/api/betslips/${id}/watch`,
      req.body || {},
      {
        headers: { ...(req.headers || {}), host: undefined },
        timeout: 15000,
      }
    );
    return res.status(resp.status).json(resp.data);
  } catch (e) {
    console.error(
      `[route-alias-local] POST /api/betslip/:id/watch forward failed for ${req.params.id}`,
      e?.message || e
    );
    if (e.response) return res.status(e.response.status).send(e.response.data);
    return res.status(500).json({ error: "forward failed" });
  }
});

app.delete("/api/betslip/:id/watch", authMiddlewareInline, async (req, res) => {
  try {
    const { id } = req.params;
    const localBase = `http://127.0.0.1:${PORT}`;
    console.log(
      `[route-alias-local] forwarding DELETE /api/betslip/${id}/watch -> ${localBase}/api/betslips/${id}/watch`
    );
    const resp = await axios.delete(`${localBase}/api/betslips/${id}/watch`, {
      headers: { ...(req.headers || {}), host: undefined },
      timeout: 15000,
    });
    return res.status(resp.status).json(resp.data);
  } catch (e) {
    console.error(
      `[route-alias-local] DELETE /api/betslip/:id/watch forward failed for ${req.params.id}`,
      e?.message || e
    );
    if (e.response) return res.status(e.response.status).send(e.response.data);
    return res.status(500).json({ error: "forward failed" });
  }
});

// Backwards-compatible alias: redirect /api/betslip/notification to /api/betslip
const url = require("url");
app.get("/api/betslip/notification", (req, res) => {
  try {
    const search = url.parse(req.url).search || "";
    return res.redirect(307, "/api/betslip" + search);
  } catch (e) {
    return res.status(500).json({ error: "Redirect failed" });
  }
});

// Health check endpoint for Railway
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Initialize server
async function initialize() {
  console.log("Initializing server...");

  // Initial fetch
  await fetchScoreboard();

  // Determine initial polling mode based on scoreboard
  updateSchedulingLogic();

  // If no games detected, start slow polling as fallback
  if (!currentScoreboardInterval) {
    startScoreboardSlowPolling();
  }

  // Start a dedicated 30-minute scoreboard refresh to keep /api/rosters up-to-date.
  // This ensures the server refreshes ESPN's scoreboard feed on a regular cadence
  // regardless of the dynamic polling mode used for live games.
  if (!rostersScoreboardInterval) {
    console.log(
      "[Rosters Scheduler] Starting 30-minute scoreboard refresh for /api/rosters"
    );
    rostersScoreboardInterval = setInterval(async () => {
      try {
        console.log("[Rosters Scheduler] Refreshing scoreboard for rosters...");
        await fetchScoreboard();
        // Clear the cached combined rosters/gamelogs so the next /api/rosters call
        // will rebuild data based on the fresh scoreboard. We avoid immediate
        // fetchAllRostersAndGamelogs here to keep this interval lightweight.
        if (rosterGamelogCache["all"]) {
          delete rosterGamelogCache["all"];
          console.log(
            '[Rosters Scheduler] Cleared rosterGamelogCache["all"] to force refresh on next request'
          );
        }
      } catch (err) {
        console.error(
          "[Rosters Scheduler] Error refreshing scoreboard:",
          err?.message || err
        );
      }
    }, 30 * 60 * 1000);
  }

  // Kick off a background rosters/gamelogs fetch on startup so /api/rosters
  // has cached data without requiring a manual request. Run best-effort and
  // do not block server initialization.
  try {
    if (!rosterGamelogCache["all"]) {
      fetchAllRostersAndGamelogs()
        .then(() => console.log("[Rosters] Initial background rosters/gamelogs fetch complete"))
        .catch((e) => console.warn("[Rosters] Initial fetch failed (non-fatal)", e?.message || e));
    }
  } catch (e) {
    console.warn("[Rosters] Failed to start initial fetch", e?.message || e);
  }

  // Start realtime listener so server reacts to external inserts into Supabase
  try {
    setupBetslipRealtimeListener();
    try {
      await seedPendingWatchers();
    } catch (e) {
      console.warn("[watcher] seedPendingWatchers failed", e?.message || e);
    }
  } catch (e) {
    console.warn(
      "Failed to initialize betslips realtime listener:",
      e?.message || e
    );
  }

  console.log("Server initialized successfully");
}

// --------------------------
// Inlined Auth routes
// --------------------------
app.post(
  "/api/auth/signup",
  [
    body("username").isLength({ min: 3 }).trim().escape(),
    body("password").isLength({ min: 6 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });

      const { username, password, credits = 2500 } = req.body;
      // check exists
      const { data: existing } = await supabaseAdmin
        .from("users")
        .select("id")
        .eq("username", username)
        .limit(1);
      if (existing && existing.length > 0)
        return res.status(400).json({ message: "Username already exists" });

      const passwordHash = await bcrypt.hash(password, 10);
      const { data, error } = await supabaseAdmin
        .from("users")
        .insert({ username, password_hash: passwordHash, credits })
        .select()
        .maybeSingle();
      if (error) throw error;
      // After creating a user, check for an existing profile with same username and include profileId if present
      let profileId = null;
      try {
        const { data: prof } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("username", username)
          .maybeSingle();
        if (prof && prof.id) profileId = prof.id;
      } catch (e) {
        /* ignore */
      }

      if (!process.env.JWT_SECRET)
        return res.status(500).json({ message: "JWT_SECRET not configured" });
      const token = jwt.sign(
        { userId: data.id, username: data.username, profileId },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
      );
      res.status(201).json({
        message: "User created",
        user: {
          id: data.id,
          username: data.username,
          credits: data.credits,
          profileId,
        },
        token,
      });
    } catch (e) {
      console.error("signup error", e);
      res.status(500).json({ message: "Server error" });
    }
  }
);

app.post("/api/auth/login", async (req, res) => {
  try {
    const rawBody = req.body || {};
    const { username, password } = rawBody;
    // Sanitize headers: mask Authorization
    const incomingHeaders = { ...req.headers };
    if (incomingHeaders.authorization) {
      const token =
        incomingHeaders.authorization.split(" ")[1] ||
        incomingHeaders.authorization;
      incomingHeaders.authorization = `${String(token).slice(0, 8)}...<masked>`;
    }
    // Avoid printing cookies or other very large headers
    if (incomingHeaders.cookie) incomingHeaders.cookie = "<cookie masked>";

    console.log("[auth/login] incoming headers (sanitized):", incomingHeaders);
    console.log("[auth/login] request body (sanitized):", {
      username: username || null,
      password: password ? "***" : null,
      rawBody,
    });
    const { data: user, error } = await supabaseAdmin
      .from("users")
      .select("id, username, password_hash, credits")
      .eq("username", username)
      .maybeSingle();
    console.log("[auth/login] users.select result:", {
      user: user
        ? { id: user.id, username: user.username, credits: user.credits }
        : null,
      error: error ? error.message || error : null,
    });
    if (error) throw error;

    // If no legacy users row, attempt to resolve using the provided Supabase access token (if present)
    if (!user) {
      const authHeaderRaw = req.headers.authorization || null;
      const incomingToken = authHeaderRaw
        ? authHeaderRaw.startsWith("Bearer ")
          ? authHeaderRaw.split(" ")[1]
          : authHeaderRaw
        : null;
      console.log(
        "[auth/login] no legacy users row found for username; incomingToken present=",
        !!incomingToken
      );
      if (incomingToken) {
        try {
          console.log(
            "[auth/login] attempting supabaseAdmin.auth.getUser with masked token",
            `${String(incomingToken).slice(0, 8)}...<masked>`
          );
          const { data: sbData, error: sbErr } =
            await supabaseAdmin.auth.getUser(incomingToken);
          console.log("[auth/login] supabaseAdmin.auth.getUser result:", {
            sbData: sbData || null,
            error: sbErr ? sbErr.message || sbErr : null,
          });
          const supabaseUser = sbData && sbData.user ? sbData.user : null;
          if (supabaseUser && supabaseUser.id) {
            // Try to find a profile with this Supabase UUID
            try {
              const { data: prof, error: profErr } = await supabaseAdmin
                .from("profiles")
                .select("id, username, phone, credits")
                .eq("id", supabaseUser.id)
                .maybeSingle();
              console.log(
                "[auth/login] profiles.select by supabase user id result:",
                {
                  prof: prof || null,
                  error: profErr ? profErr.message || profErr : null,
                }
              );
              if (prof && prof.id) {
                if (!process.env.JWT_SECRET)
                  return res
                    .status(500)
                    .json({ message: "JWT_SECRET not configured" });
                const token = jwt.sign(
                  {
                    userId: null,
                    username: prof.username || username,
                    profileId: prof.id,
                    supabaseUserId: supabaseUser.id,
                  },
                  process.env.JWT_SECRET,
                  { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
                );
                return res.json({
                  message: "Login successful (via Supabase token)",
                  user: {
                    id: null,
                    username: prof.username || username,
                    credits: prof.credits || null,
                    profileId: prof.id,
                  },
                  token,
                });
              }
            } catch (profLookupErr) {
              console.error(
                "[auth/login] error looking up profile by supabase id",
                profLookupErr
              );
            }
          }
        } catch (e) {
          console.error(
            "[auth/login] error resolving supabase token",
            e && e.message ? e.message : e
          );
        }
      }
      return res.status(404).json({ message: "User not found" });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ message: "Invalid password" });
    if (!process.env.JWT_SECRET)
      return res.status(500).json({ message: "JWT_SECRET not configured" });
    // Try to find a matching profile UUID for this username
    let profileId = null;
    try {
      console.log(
        "[auth/login] attempting profiles.select by username=",
        user.username
      );
      const { data: prof, error: profErr } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("username", user.username)
        .maybeSingle();
      console.log("[auth/login] profiles.select result:", {
        prof: prof || null,
        error: profErr ? profErr.message || profErr : null,
      });
      if (prof && prof.id) profileId = prof.id;
    } catch (e) {
      /* ignore */
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username, profileId },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );
    res.json({
      message: "Login successful",
      user: {
        id: user.id,
        username: user.username,
        credits: user.credits,
        profileId,
      },
      token,
    });
  } catch (e) {
    console.error("login error", e);
    res.status(500).json({ message: "Server error" });
  }
});

// Simple auth middleware used by inlined routes
// Accepts either the server-issued JWT (signed with JWT_SECRET) OR a
// Supabase access token. For Supabase tokens we resolve the user via
// the admin client so we can run privileged actions on behalf of the user.
async function authMiddlewareInline(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer "))
    return res.status(401).json({ message: "Unauthorized" });
  const token = auth.split(" ")[1];

  // Try server JWT first
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Accept multiple possible id fields: userId, profileId, supabaseUserId, user_id
    req.userId =
      decoded.userId ||
      decoded.profileId ||
      decoded.supabaseUserId ||
      decoded.user_id ||
      null;
    req.username = decoded.username || decoded.email || null;
    if (!req.userId) {
      // Token was valid but didn't contain a user id we recognize; allow middleware to proceed
      // so downstream handlers can decide (they may still require a profile id and reject).
      console.warn(
        "Auth: JWT had no userId/profileId; proceeding with null userId"
      );
    }
    return next();
  } catch (e) {
    // Not a server JWT — try Supabase access token
  }

  try {
    // supabaseAdmin.auth.getUser accepts an access token and returns user info
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data || !data.user) {
      return res.status(401).json({ message: "Invalid token" });
    }
    req.userId = data.user.id;
    req.username = data.user.email || null;
    return next();
  } catch (e) {
    return res.status(401).json({ message: "Invalid token" });
  }
}

app.post("/api/auth/verify", authMiddlewareInline, async (req, res) => {
  try {
    // Prefer returning profile info when available
    if (req.username) {
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("id, username, credits, phone, created_at")
        .eq("username", req.username)
        .maybeSingle();
      if (prof) return res.json({ user: prof });
    }
    const { data } = await supabaseAdmin
      .from("users")
      .select("id, username, credits")
      .eq("id", req.userId)
      .maybeSingle();
    if (!data) return res.status(404).json({ message: "User not found" });
    res.json({ user: data });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
});

// --------------------------
// Inlined profile route (push-token upsert)
// --------------------------
app.post("/api/profile/push-token", authMiddlewareInline, async (req, res) => {
  try {
    const { pushToken, platform } = req.body;
    if (!pushToken)
      return res.status(400).json({ message: "pushToken required" });
    // Prefer profiles->push_tokens when a profile UUID exists for this user
    let profileId = null;
    try {
      if (typeof req.userId === "string" && req.userId.includes("-")) {
        // userId is already a UUID, assume it maps to profiles.id
        profileId = req.userId;
      } else if (req.username) {
        const { data: prof } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("username", req.username)
          .maybeSingle();
        if (prof && prof.id) profileId = prof.id;
      }
    } catch (e) {
      console.warn("profile resolution failed", e?.message || e);
    }

    if (profileId) {
      try {
        // Ensure this push token is not still associated with a different profile.
        // If the same Expo token exists for another user, remove that association
        // so the token is reassigned to the current profile below.
        try {
          await supabaseAdmin
            .from("push_tokens")
            .delete()
            .neq("user_id", profileId)
            .eq("expo_push_token", pushToken);
        } catch (e) {
          console.warn(
            "push-token cleanup before upsert failed",
            e?.message || e
          );
        }
        const { error } = await supabaseAdmin
          .from("push_tokens")
          .upsert({ user_id: profileId, expo_push_token: pushToken, platform })
          .eq("user_id", profileId);
        if (error) throw error;
        return res.json({ success: true, source: "push_tokens:profile" });
      } catch (err) {
        console.warn(
          "push_tokens upsert with profileId failed",
          err?.message || err
        );
        // fallback to legacy path below
      }
    }

    // Legacy/fallback: try upserting with whatever userId we have, then update users.push_token if that fails
    try {
      // Remove any rows where this token is present for a different user
      try {
        await supabaseAdmin
          .from("push_tokens")
          .delete()
          .neq("user_id", req.userId)
          .eq("expo_push_token", pushToken);
      } catch (e) {
        console.warn("push-token cleanup (legacy) failed", e?.message || e);
      }
      const { error } = await supabaseAdmin
        .from("push_tokens")
        .upsert({ user_id: req.userId, expo_push_token: pushToken, platform })
        .eq("user_id", req.userId);
      if (!error)
        return res.json({ success: true, source: "push_tokens:legacy" });
      throw error;
    } catch (upsertErr) {
      console.warn(
        "push_tokens upsert legacy failed, attempting users.push_token fallback",
        upsertErr?.message || upsertErr
      );
      try {
        const { error: updErr } = await supabaseAdmin
          .from("users")
          .update({ push_token: pushToken })
          .eq("id", req.userId);
        if (updErr) throw updErr;
        return res.json({ success: true, source: "users.push_token" });
      } catch (updErr) {
        console.error(
          "push-token update users failed",
          updErr?.message || updErr
        );
        throw updErr;
      }
    }
  } catch (e) {
    console.error("push-token upsert", e);
    res.status(500).json({ message: "Server error" });
  }
});

// --------------------------
// Inlined betslips routes and watcher (uses Supabase HTTP)
// --------------------------
// Recent notification suppression to avoid spamming the same user
// about the same event multiple times in a short window.
const recentNotifications = {};
// Returns true if the notification should be suppressed (recently sent).
function shouldSuppressNotification(userId, eventId, type, windowMs = 30000) {
  try {
    if (!userId || !eventId || !type) return false;
    // For critical lifecycle events (started/ended), use a much longer
    // suppression window by default to avoid notifying the same user
    // multiple times from different watchers or rapid reconnects.
    const LONG_WINDOW = 24 * 60 * 60 * 1000; // 24 hours
    if ((type === "started" || type === "ended") && windowMs === 30000) {
      windowMs = LONG_WINDOW;
    }
    const now = Date.now();
    recentNotifications[userId] = recentNotifications[userId] || {};
    const userMap = recentNotifications[userId];
    userMap[eventId] = userMap[eventId] || {};
    const last = userMap[eventId][type] || 0;
    if (now - last < windowMs) return true;
    userMap[eventId][type] = now;
    return false;
  } catch (e) {
    return false;
  }
}
const betslipWatchers = {};
const testNotifiers = {};

function startWatcherInline(betslipId) {
  console.log(`[watcher] startWatcherInline requested for ${betslipId}`);
  if (betslipWatchers[betslipId]) {
    console.log(`[watcher] already watching ${betslipId}, skipping start`);
    return;
  }
  const lastStates = {};
  const lastEventStatus = {};
  const intervalId = setInterval(async () => {
    try {
      const { data: rows } = await supabaseAdmin
        .from("betslips")
        .select("*")
        .eq("id", betslipId)
        .limit(1);
      const fresh = (rows && rows[0]) || null;
      if (!fresh) {
        clearInterval(intervalId);
        delete betslipWatchers[betslipId];
        try {
          stopTestNotifier(betslipId);
        } catch (e) {}
        return;
      }
      // Prefer fetching the canonical betslip payload via persisted `betslip_url`.
      // If available, fetch that URL and normalize its `events` into per-pick entries.
      let betsArr = (fresh.betslip_data && fresh.betslip_data.bets) || [];
      const betslipUrl =
        fresh.betslip_url ||
        fresh.betslip_data?.betslip_url ||
        fresh.betslip_data?.betslipUrl ||
        null;

      if (betslipUrl) {
        try {
          const resp = await axios.get(betslipUrl);
          const payload = resp.data || {};
          const events = payload.events || [];
          const normalized = [];
          for (const ev of events) {
            const gid = ev.eventId || ev.id || ev.eventId || null;
            // event-level bets
            if (ev.bets) {
              // moneyline
              if (ev.bets.moneyline) {
                normalized.push({
                  id: `moneyline:${gid}:${ev.bets.moneyline.team}`,
                  gameId: gid,
                  type: "moneyline",
                  team: ev.bets.moneyline.team,
                  current: ev.bets.moneyline.current,
                });
              }
              // total points
              if (ev.bets.totalPoints) {
                normalized.push({
                  id: `total:${gid}`,
                  gameId: gid,
                  type: "total",
                  line: ev.bets.totalPoints.line,
                  current: {
                    current: ev.bets.totalPoints.current,
                    won: ev.bets.totalPoints.won,
                  },
                });
              }
              // spread
              if (ev.bets.spread) {
                normalized.push({
                  id: `spread:${gid}:${ev.bets.spread.team}`,
                  gameId: gid,
                  type: "spread",
                  team: ev.bets.spread.team,
                  current: ev.bets.spread.current,
                });
              }
              // players
              if (Array.isArray(ev.bets.players)) {
                for (const p of ev.bets.players) {
                  const pid = p.id || p.playerId || null;
                  // overUnder entries
                  for (const k of Object.keys(p.overUnder || {})) {
                    const entry = p.overUnder[k];
                    normalized.push({
                      id: `player:${gid}:${pid}:${k}:ou`,
                      gameId: gid,
                      type: "player_overunder",
                      playerId: pid,
                      stat: k,
                      bet: entry?.bet,
                      side: entry?.type || entry?.side || null,
                      current: { current: entry?.current, won: entry?.won },
                    });
                  }
                  // milestones
                  for (const k of Object.keys(p.milestones || {})) {
                    const entry = p.milestones[k];
                    normalized.push({
                      id: `player:${gid}:${pid}:${k}:ms`,
                      gameId: gid,
                      type: "player_milestone",
                      playerId: pid,
                      stat: k,
                      threshold: entry?.threshold || entry?.bet,
                      current: { current: entry?.current, won: entry?.won },
                    });
                  }
                }
              }
            }
          }
          if (normalized.length > 0) betsArr = normalized;
        } catch (e) {
          console.warn(
            "watcher: failed to fetch betslip_url, falling back to stored data",
            e?.message || e
          );
        }
      }
      // fetch summaries
      console.log(
        `[watcher ${betslipId}] tick - bets:${betsArr.length} betslipUrl:${
          betslipUrl ? "yes" : "no"
        }`
      );
      const summaries = {};
      for (const evId of Array.from(
        new Set(betsArr.map((b) => b.gameId || b.game_id).filter(Boolean))
      )) {
        try {
          const resp = await axios.get(
            `${ESPN_BASE_URL}/summary?event=${evId}`
          );
          summaries[evId] = resp.data;
        } catch (e) {
          console.error("summary fetch", e);
        }
      }
      console.log(
        `[watcher ${betslipId}] summaries fetched: ${Object.keys(
          summaries
        ).join(",")}`
      );

      const isFirstTick = Object.keys(lastStates).length === 0;
      let allFinal = true;
      let anyLost = false;
      let anyCompleted = false;
      let anyCompletedNotWon = false;

      for (const bet of betsArr) {
        const pickKey = bet.id || JSON.stringify(bet);
        const evId = bet.gameId || bet.game_id;
        const summary = summaries[evId];
        let newState = null;
        let isCompleted = false;

        // If the stored bet object already contains resolved flags (e.g. from
        // a previous /api/betslip computation or external update), prefer
        // those markers so we can notify immediately.
        try {
          // Accept multiple shapes for resolved flags.
          // 1) Top-level `won` boolean
          const topWon = bet.won;
          if (
            topWon === true ||
            (typeof topWon === "string" &&
              String(topWon).toLowerCase() === "true")
          ) {
            newState = "won";
            isCompleted = true;
          } else if (
            topWon === false ||
            (typeof topWon === "string" &&
              String(topWon).toLowerCase() === "false")
          ) {
            newState = "lost";
            isCompleted = true;
          }

          // 2) Normalized shape from betslip_url: { current: { current, won } }
          if (
            newState === null &&
            bet.current &&
            typeof bet.current === "object"
          ) {
            const curWon = bet.current.won;
            if (
              curWon === true ||
              (typeof curWon === "string" &&
                String(curWon).toLowerCase() === "true")
            ) {
              newState = "won";
              isCompleted = true;
            } else if (
              curWon === false ||
              (typeof curWon === "string" &&
                String(curWon).toLowerCase() === "false")
            ) {
              newState = "lost";
              isCompleted = true;
            } else if (
              typeof curWon === "string" &&
              String(curWon).toLowerCase() === "in progress"
            ) {
              newState = "in progress";
              isCompleted = false;
            }
          }

          // 3) Original nested overUnder entries (per-player object)
          if (
            newState === null &&
            bet.overUnder &&
            typeof bet.overUnder === "object"
          ) {
            for (const k of Object.keys(bet.overUnder)) {
              const entry = bet.overUnder[k];
              if (entry && entry.won === true) {
                newState = "won";
                isCompleted = true;
                break;
              }
              if (entry && entry.won === false) {
                newState = "lost";
                isCompleted = true;
                break;
              }
            }
          }

          // 4) Nested milestones entries
          if (
            newState === null &&
            bet.milestones &&
            typeof bet.milestones === "object"
          ) {
            for (const k of Object.keys(bet.milestones)) {
              const entry = bet.milestones[k];
              const wonVal = entry?.won;
              if (
                entry &&
                (wonVal === true ||
                  (typeof wonVal === "string" &&
                    String(wonVal).toLowerCase() === "true"))
              ) {
                newState = "won";
                isCompleted = true;
                break;
              }
              if (
                entry &&
                (wonVal === false ||
                  (typeof wonVal === "string" &&
                    String(wonVal).toLowerCase() === "false"))
              ) {
                newState = "lost";
                isCompleted = true;
                break;
              }
              if (
                entry &&
                typeof entry.won === "string" &&
                String(entry.won).toLowerCase() === "in progress"
              ) {
                newState = "in progress";
                isCompleted = false;
                break;
              }
            }
          }
        } catch (e) {
          console.warn(
            "watcher: error checking stored bet flags",
            e?.message || e
          );
        }

        if (!summary) {
          newState = "in progress";
        } else {
          const gameStatus = summary.header?.competitions?.[0]?.status?.type;
          const statusName =
            gameStatus?.name ||
            gameStatus?.state ||
            gameStatus?.description ||
            "";
          const isInProgress =
            /in/i.test(String(statusName)) && !gameStatus?.completed;
          // Preserve any completion state derived from the bet payload itself
          // (e.g., `bet.current.won=true`) rather than overwriting it with
          // the game's completed flag. Use logical OR so a pick marked
          // completed by the payload remains completed even if the game
          // summary hasn't flipped `completed: true` yet.
          const gameCompleted = !!gameStatus?.completed;
          isCompleted = Boolean(isCompleted) || gameCompleted;

          // detect game started and ended and emit once per event (skip on first tick)
          const prevEvent = lastEventStatus[evId];
          const competitors =
            summary.header?.competitions?.[0]?.competitors || [];
          const homeCompetitor =
            competitors.find((c) => c.homeAway === "home") ||
            competitors[0] ||
            {};
          const awayCompetitor =
            competitors.find((c) => c.homeAway === "away") ||
            competitors[1] ||
            {};
          const homeAbbr = homeCompetitor.team?.abbreviation || "";
          const awayAbbr = awayCompetitor.team?.abbreviation || "";
          const homeScore = homeCompetitor.score || "";
          const awayScore = awayCompetitor.score || "";

          // determine event start time and windows to avoid notifying long-past events
          const startTimeRaw = summary.header?.competitions?.[0]?.date || null;
          let startedRecently = false;
          let startedWithinDay = false;
          try {
            if (startTimeRaw) {
              const startDate = new Date(startTimeRaw);
              const minutesSinceStart =
                (Date.now() - startDate.getTime()) / 60000;
              // within +/-30 minutes
              startedRecently =
                minutesSinceStart >= -30 && minutesSinceStart <= 30;
              // started within last day (useful for end notifications fallback)
              startedWithinDay =
                minutesSinceStart >= 0 && minutesSinceStart <= 24 * 60;
            }
          } catch (e) {
            startedRecently = false;
            startedWithinDay = false;
          }

          // Notify Game Started only on a real transition (prevEvent exists) or
          // when the event start time is within a recent 30-minute window.
          if (
            !isFirstTick &&
            prevEvent !== "in progress" &&
            isInProgress &&
            (prevEvent !== undefined || startedRecently)
          ) {
            // Avoid spamming the same user about the same event multiple
            // times from different watchers or rapid ticks.
            if (!shouldSuppressNotification(fresh.user_id, evId, "started")) {
              console.log(
                `[watcher ${betslipId}] notify -> Game Started user:${fresh.user_id} event:${evId}`
              );
              await sendPushNotification(
                fresh.user_id,
                "Game Started 🏀",
                `${homeAbbr} vs ${awayAbbr} has now started`,
                { betslipId: fresh.id, eventId: evId }
              );
            } else {
              console.log(
                `[watcher ${betslipId}] suppressed duplicate Game Started notify -> user:${fresh.user_id} event:${evId}`
              );
            }
          }

          // Notify Game Ended only on a real transition (prevEvent exists) or
          // when the event start time was within the last day (safety window).
          if (
            !isFirstTick &&
            prevEvent !== "completed" &&
            isCompleted &&
            (prevEvent !== undefined || startedWithinDay)
          ) {
            if (!shouldSuppressNotification(fresh.user_id, evId, "ended")) {
              console.log(
                `[watcher ${betslipId}] notify -> Game Ended user:${fresh.user_id} event:${evId}`
              );
              await sendPushNotification(
                fresh.user_id,
                "Game Ended 🏀",
                `${homeAbbr} ${homeScore} vs ${awayAbbr} ${awayScore} has ended`,
                { betslipId: fresh.id, eventId: evId }
              );
            } else {
              console.log(
                `[watcher ${betslipId}] suppressed duplicate Game Ended notify -> user:${fresh.user_id} event:${evId}`
              );
            }
          }

          lastEventStatus[evId] = isCompleted
            ? "completed"
            : isInProgress
            ? "in progress"
            : "scheduled";

          // simplified heuristics (moneyline/total/spread/player)
          // Only compute type-specific heuristics when we don't already
          // have a resolved `newState` from the incoming payload (authoritative).
          if (newState === null && !bet.playerId && !bet.player && !bet.prop) {
            const competitors =
              summary.header?.competitions?.[0]?.competitors || [];
            const betTeam = competitors.find(
              (c) =>
                c.team?.abbreviation ===
                (bet.team || bet.selection || bet.description)
            );
            const opp = competitors.find(
              (c) =>
                c.team?.abbreviation !==
                (bet.team || bet.selection || bet.description)
            );
            if (betTeam && opp) {
              const betScore = parseInt(betTeam.score) || 0;
              const oppScore = parseInt(opp.score) || 0;
              let isWinning = false;
              // If this is a spread bet, prefer adjustedScore if provided
              if (
                bet.type === "spread" ||
                String(bet.id || "").startsWith("spread:")
              ) {
                // Try adjustedScore first: format like "+6.5" or "-3.0"
                const adjustedRaw =
                  bet.current?.adjustedScore || bet.current?.adjusted || null;
                if (adjustedRaw != null) {
                  const adj = parseFloat(
                    String(adjustedRaw).replace(/[^0-9\.-]/g, "")
                  );
                  if (!Number.isNaN(adj)) {
                    isWinning = adj >= 0;
                  }
                } else if (bet.line != null) {
                  // fallback: compute adjusted = betScore + line - oppScore
                  const lineNum =
                    parseFloat(String(bet.line).replace(/[^0-9\.-]/g, "")) || 0;
                  const adjusted = betScore + lineNum - oppScore;
                  isWinning = adjusted >= 0;
                } else {
                  // as a last resort, compare raw scores
                  isWinning = betScore > oppScore;
                }
              } else {
                // moneyline / generic comparison
                isWinning = betScore > oppScore;
              }
              // Determine state carefully and log details for diagnostics
              if (isCompleted) {
                newState = isWinning ? "won" : "lost";
              } else {
                newState = isWinning ? "in progress" : "pending";
              }
              const labelType = bet.type || "moneyline";
              console.log(
                `[watcher ${betslipId}] pick:${pickKey} ${labelType} check -> team:${
                  bet.team || bet.selection || bet.description
                } score:${betScore}-${oppScore} isWinning:${isWinning} isInProgress:${isInProgress} isCompleted:${isCompleted} -> newState:${newState}`
              );
            }
          }
          if (
            newState === null &&
            (bet.line || bet.betValue || bet.type === "total")
          ) {
            const competitors =
              summary.header?.competitions?.[0]?.competitors || [];
            const home =
              parseInt(competitors.find((c) => c.homeAway === "home")?.score) ||
              0;
            const away =
              parseInt(competitors.find((c) => c.homeAway === "away")?.score) ||
              0;
            const currentTotal = home + away;
            const raw = bet.line || bet.betValue || "";
            const isOver = String(raw).toLowerCase().startsWith("o");
            const lineNum =
              parseFloat(String(raw).replace(/[^0-9\\.\\-]/g, "")) || 0;
            const isWinning = isOver
              ? currentTotal > lineNum
              : currentTotal < lineNum;
            if (isWinning) {
              // If game is in progress treat the bet as won immediately
              newState = isCompleted || isInProgress ? "won" : "in progress";
            } else {
              newState = isCompleted ? "lost" : "pending";
            }
          }
          // Player-specific over/under numeric heuristics: if we have a
          // `player_overunder` and it's an 'over' bet, treat current > bet
          // as an in-progress win even before the game completes.
          if (newState === null && bet.type === "player_overunder") {
            try {
              const cur = Number(bet.current?.current);
              const lineNum = Number(bet.bet);
              const isOverSide =
                String(bet.side || "").toLowerCase() === "over";
              if (
                isOverSide &&
                Number.isFinite(cur) &&
                Number.isFinite(lineNum)
              ) {
                const isWinning = cur > lineNum;
                if (isWinning) {
                  newState = isCompleted || isInProgress ? "won" : "in progress";
                } else {
                  newState = isCompleted ? "lost" : "pending";
                }
              }
            } catch (e) {}
          }

          if (newState === null) newState = "in progress";
        }

        // Log computed state for this pick for easier debugging
        try {
          console.log(
            `[watcher ${betslipId}] pickResult -> pick:${pickKey} computed:${newState} isCompleted:${isCompleted} rawBet:${JSON.stringify(
              bet
            )} summaryState:${
              summary?.header?.competitions?.[0]?.status?.type?.state
            }`
          );
        } catch (e) {}

        // track completion metrics for finalization rule
        if (isCompleted) anyCompleted = true;
        if (isCompleted && newState !== "won") anyCompletedNotWon = true;

        // avoid spamming notifications on the very first tick when watcher starts
        if (lastStates[pickKey] !== newState) {
          if (!isFirstTick) {
            if (newState === "won") {
              console.log(
                `[watcher ${betslipId}] notify -> Pick Won user:${fresh.user_id} pick:${pickKey}`
              );
            }
            if (newState === "lost") {
              console.log(
                `[watcher ${betslipId}] notify -> Pick Lost user:${fresh.user_id} pick:${pickKey}`
              );
            }
            if (newState === "in progress") {
              console.log(
                `[watcher ${betslipId}] notify -> Pick In Progress user:${fresh.user_id} pick:${pickKey}`
              );
            }
          }
          lastStates[pickKey] = newState;
        }

        // Consider final states only: won, lost, push, void
        if (!["won", "lost", "push", "void"].includes(newState)) {
          allFinal = false;
        }
        if (newState === "lost") anyLost = true;
      }

      // New finalization rule: if any completed pick exists and any completed pick is not won -> mark whole bet lost
      // NOTE: avoid finalizing on the very first tick immediately after creation
      // If the betslip payload included multiple events (games) but some
      // of those events contain no picks (e.g. parlay with one player bet and
      // another game with no player selections yet), we should not finalize
      // the bet until those other events are no longer in 'pre' or otherwise
      // incomplete. Check for any such events and, if found and still pre,
      // defer finalization by treating the slip as not-final.
      let hasPendingEmptyEvents = false;
      try {
        const payloadEvents =
          (fresh.betslip_data && fresh.betslip_data.events) || [];
        if (Array.isArray(payloadEvents) && payloadEvents.length > 0) {
          for (const ev of payloadEvents) {
            const evId = ev.eventId || ev.id || ev.eventId || null;
            const hasBets =
              (ev.bets && Object.keys(ev.bets).length > 0) ||
              (Array.isArray(ev.bets?.players) && ev.bets.players.length > 0);
            if (!hasBets && evId) {
              // If we have a summary for this event and it's not completed,
              // consider it pending and prevent premature finalization.
              const s = summaries[evId];
              if (!s) {
                hasPendingEmptyEvents = true;
                break;
              }
              const evStatus = s.header?.competitions?.[0]?.status?.type || {};
              const evCompleted = !!evStatus.completed;
              if (!evCompleted) {
                hasPendingEmptyEvents = true;
                break;
              }
            }
          }
        }
      } catch (e) {
        // ignore and be conservative
        hasPendingEmptyEvents = true;
      }

      if (
        !isFirstTick &&
        anyCompleted &&
        anyCompletedNotWon &&
        !hasPendingEmptyEvents
      ) {
        if (fresh.status !== "lost") {
          try {
            // Use DB RPC to atomically settle and record ledger/history
            const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc(
              "settle_betslip",
              { p_betslip_id: betslipId, p_result: "lost" }
            );
            if (rpcErr) {
              console.error(
                `[watcher ${betslipId}] settle_betslip RPC error`,
                rpcErr
              );
              // Fallback: attempt manual settlement using service role
              await manualSettleBetslip(betslipId, "lost");
            } else {
              console.log(
                `[watcher ${betslipId}] settled (lost) via RPC for user:${fresh.user_id}`,
                rpcRes
              );
            }
            // Use centralized formatter to produce richer notification
            await sendBetResultNotification(betslipId);
          } catch (e) {
            console.error(
              `[watcher ${betslipId}] error while settling lost bet`,
              e?.message || e
            );
          }
        }
        clearInterval(intervalId);
        delete betslipWatchers[betslipId];
        try {
          stopTestNotifier(betslipId);
        } catch (e) {}
        return;
      }

      // Also avoid finalizing the whole slip as won/lost if there are
      // pending events that have no bets (parlay gaps) which are not yet
      // completed. This prevents a single-leg completion from settling the
      // entire multi-game bet when another game is still 'pre'.
      if (!isFirstTick && allFinal && !hasPendingEmptyEvents) {
        const newStatus = anyLost ? "lost" : "won";
        if (fresh.status !== newStatus) {
          try {
            const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc(
              "settle_betslip",
              { p_betslip_id: betslipId, p_result: newStatus }
            );
            if (rpcErr) {
              console.error(
                `[watcher ${betslipId}] settle_betslip RPC error`,
                rpcErr
              );
              // Fallback: attempt manual settlement using service role
              await manualSettleBetslip(betslipId, newStatus);
            } else {
              console.log(
                `[watcher ${betslipId}] settled via RPC -> ${newStatus} user:${fresh.user_id}`,
                rpcRes
              );
            }
            // send bet result using centralized formatter
            await sendBetResultNotification(betslipId);
          } catch (e) {
            console.error(
              `[watcher ${betslipId}] error while settling bet`,
              e?.message || e
            );
          }
        }
        clearInterval(intervalId);
        delete betslipWatchers[betslipId];
        try {
          stopTestNotifier(betslipId);
        } catch (e) {}
      }
    } catch (e) {
      console.error("watcher tick error", e);
    }
  }, 4000);
  betslipWatchers[betslipId] = { intervalId, lastStates, lastEventStatus };
  console.log(`[watcher] started watcher for ${betslipId}`);
}

function startTestNotifier(betslipId) {
  console.log(`[testNotifier] start requested for ${betslipId}`);
  if (testNotifiers[betslipId]) {
    console.log(`[testNotifier] already running for ${betslipId}`);
    return;
  }
  const intervalId = setInterval(async () => {
    try {
      const { data: rows } = await supabaseAdmin
        .from("betslips")
        .select("*")
        .eq("id", betslipId)
        .limit(1);
      const fresh = (rows && rows[0]) || null;
      if (!fresh) {
        clearInterval(intervalId);
        delete testNotifiers[betslipId];
        return;
      }

      const betslipUrl =
        fresh.betslip_url ||
        fresh.betslip_data?.betslip_url ||
        fresh.betslip_data?.betslipUrl ||
        null;

      let payload = null;
      if (betslipUrl) {
        try {
          const resp = await axios.get(betslipUrl);
          payload = resp.data || null;
        } catch (e) {
          console.warn(
            "test-notifier: failed to fetch betslip_url",
            e?.message || e
          );
        }
      }

      // Fallback: use stored betslip_data.events if present
      if (!payload && fresh.betslip_data) payload = fresh.betslip_data;
      if (!payload) return;

      const events = payload.events || [];
      for (const ev of events) {
        const title = ev.status?.shortDetail || ev.status?.detail || "Update";
        const players = (ev.bets && ev.bets.players) || [];
        for (const p of players) {
          // prioritize overUnder entries
          for (const k of Object.keys(p.overUnder || {})) {
            const entry = p.overUnder[k];
            const betVal = entry?.bet ?? entry?.line ?? "";
            const current = entry?.current ?? "";
            const won = entry?.won ?? false;
            const body = `${betVal}, ${current}, ${won}`;
            console.log(
              `[testNotifier ${betslipId}] notify -> user:${
                fresh.user_id
              } title:${title} body:${body} player:${p.id || null}`
            );
            await sendPushNotification(fresh.user_id, title, body, {
              betslipId,
              eventId: ev.eventId || ev.id,
              playerId: p.id || null,
            });
          }
          // milestones
          for (const k of Object.keys(p.milestones || {})) {
            const entry = p.milestones[k];
            const betVal = entry?.threshold ?? entry?.bet ?? "";
            const current = entry?.current ?? "";
            const won = entry?.won ?? false;
            const body = `${betVal}, ${current}, ${won}`;
            console.log(
              `[testNotifier ${betslipId}] notify -> user:${
                fresh.user_id
              } title:${title} body:${body} player:${p.id || null}`
            );
            await sendPushNotification(fresh.user_id, title, body, {
              betslipId,
              eventId: ev.eventId || ev.id,
              playerId: p.id || null,
            });
          }
        }
      }
    } catch (e) {
      console.error("test-notifier tick error", e?.message || e);
    }
  }, 60 * 1000);
  testNotifiers[betslipId] = { intervalId };
  console.log(`[testNotifier] started for ${betslipId}`);
}

function stopTestNotifier(betslipId) {
  if (!testNotifiers[betslipId]) return;
  clearInterval(testNotifiers[betslipId].intervalId);
  delete testNotifiers[betslipId];
}

// Supabase Realtime listener: automatically start watcher when a new
// betslip row is inserted (handles clients that write directly to Supabase)
function setupBetslipRealtimeListener() {
  try {
    console.log("[realtime] setting up betslips INSERT listener...");
    const ch = supabaseAdmin
      .channel("betslips-watcher")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "betslips" },
        (payload) => {
          try {
            const id = payload?.new?.id;
            const userId = payload?.new?.user_id;
            console.log(
              `[realtime] betslips INSERT detected id:${id} user:${userId}`
            );
            if (id) {
              // Start watcher for the new betslip (startWatcherInline is idempotent)
              try {
                startWatcherInline(id);
                if (betslipWatchers[id]) {
                  console.log(`[realtime] watcher started for ${id}`);
                } else {
                  console.warn(`[realtime] watcher did not start for ${id}`);
                }
              } catch (e) {
                console.error(
                  `[realtime] error starting watcher for ${id}`,
                  e?.message || e
                );
              }
            }
          } catch (e) {
            console.error("[realtime] payload handling error", e?.message || e);
          }
        }
      );

    // Track last poll time so fallback only picks up new rows
    if (!lastBetslipPollTimestamp)
      lastBetslipPollTimestamp = new Date().toISOString();

    // Helper: start a fallback poller when realtime cannot subscribe
    function startRealtimeFallback() {
      if (realtimeFallbackInterval) return;
      console.warn("[realtime] starting fallback poller for betslips (5s)");
      // Immediate one-time scan to pick up recent rows that may have been inserted
      (async () => {
        try {
          const lookbackMs = 60 * 60 * 1000; // 60 minutes
          const sinceTime = new Date(Date.now() - lookbackMs).toISOString();
          console.log(
            `[realtime-fallback] initial scan for betslips since ${sinceTime}`
          );
          const { data: recentRows, error: recentErr } = await supabaseAdmin
            .from("betslips")
            .select("id,created_at")
            .gt("created_at", sinceTime)
            .order("created_at", { ascending: true })
            .limit(200);
          if (recentErr)
            return console.error(
              "[realtime-fallback] initial scan error",
              recentErr.message || recentErr
            );
          if (recentRows && recentRows.length > 0) {
            for (const r of recentRows) {
              try {
                console.log(
                  `[realtime-fallback] initial scan found betslip id:${r.id} created_at:${r.created_at}`
                );
                startWatcherInline(r.id);
                if (betslipWatchers[r.id])
                  console.log(
                    `[realtime-fallback] watcher started for ${r.id}`
                  );
              } catch (e) {
                console.error(
                  `[realtime-fallback] failed to start watcher for ${r.id} during initial scan`,
                  e?.message || e
                );
              }
            }
            lastBetslipPollTimestamp =
              recentRows[recentRows.length - 1].created_at ||
              new Date().toISOString();
          }
        } catch (e) {
          console.error(
            "[realtime-fallback] initial scan error",
            e?.message || e
          );
        }
      })();
      realtimeFallbackInterval = setInterval(async () => {
        try {
          const since = lastBetslipPollTimestamp || new Date().toISOString();
          const { data: rows, error } = await supabaseAdmin
            .from("betslips")
            .select("id,created_at")
            .gt("created_at", since)
            .order("created_at", { ascending: true })
            .limit(100);
          if (error)
            return console.error(
              "[realtime-fallback] query error",
              error.message || error
            );
          if (rows && rows.length > 0) {
            for (const r of rows) {
              try {
                console.log(
                  `[realtime-fallback] detected new betslip id:${r.id} created_at:${r.created_at}`
                );
                startWatcherInline(r.id);
                if (betslipWatchers[r.id])
                  console.log(
                    `[realtime-fallback] watcher started for ${r.id}`
                  );
              } catch (e) {
                console.error(
                  `[realtime-fallback] failed to start watcher for ${r.id}`,
                  e?.message || e
                );
              }
            }
            // update last seen timestamp to newest row
            lastBetslipPollTimestamp =
              rows[rows.length - 1].created_at || new Date().toISOString();
          }
        } catch (e) {
          console.error("[realtime-fallback] poll error", e?.message || e);
        }
      }, 5000);
    }

    function stopRealtimeFallback() {
      if (!realtimeFallbackInterval) return;
      clearInterval(realtimeFallbackInterval);
      realtimeFallbackInterval = null;
      console.log("[realtime] stopped fallback poller");
    }

    ch.subscribe((status) => {
      console.log(`[realtime] subscription status: ${status}`);
      try {
        // If subscription timed out, start the fallback poller
        if (
          String(status).toUpperCase().includes("TIMED_OUT") ||
          String(status).toUpperCase().includes("TIMEOUT")
        ) {
          console.warn(
            "[realtime] subscription timed out — enabling fallback polling"
          );
          startRealtimeFallback();
        } else {
          // any successful status -> stop fallback if running
          stopRealtimeFallback();
        }
      } catch (e) {
        console.error(
          "[realtime] subscription status handler error",
          e?.message || e
        );
      }
    });
  } catch (e) {
    console.error("[realtime] failed to setup listener", e?.message || e);
  }
}

// On startup, seed watchers for recent pending betslips so we don't miss
// settlement for bets created while the server was down or missed by realtime.
async function seedPendingWatchers() {
  try {
    console.log("[watcher] seeding pending betslip watchers (7d lookback)");
    const lookbackDays = 7;
    const since = new Date(
      Date.now() - lookbackDays * 24 * 60 * 60 * 1000
    ).toISOString();
    const { data: rows, error } = await supabaseAdmin
      .from("betslips")
      .select("id,created_at,status")
      .in("status", ["pending"])
      .gt("created_at", since)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) {
      return console.error("[watcher] seed query failed", error);
    }
    if (!rows || rows.length === 0) {
      return console.log("[watcher] no pending betslips found to seed");
    }
    for (const r of rows) {
      try {
        if (!betslipWatchers[r.id]) startWatcherInline(r.id);
        if (betslipWatchers[r.id])
          console.log(
            `[watcher] seeded watcher for ${r.id} created_at:${r.created_at}`
          );
        else console.warn(`[watcher] failed to seed watcher for ${r.id}`);
      } catch (e) {
        console.error(
          `[watcher] error seeding watcher for ${r.id}`,
          e?.message || e
        );
      }
    }
  } catch (e) {
    console.error("[watcher] seedPendingWatchers error", e?.message || e);
  }
}

// Minute-notifier implementation removed.
// The server will persist `betslip_url` when provided by the client; external
// workers or background processes should fetch that URL and send notifications
// as desired. Debugging per-minute notifiers has been disabled.

app.post("/api/betslips", authMiddlewareInline, async (req, res) => {
  try {
    const { betslipData, totalStake, potentialPayout } = req.body;
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("credits")
      .eq("id", req.userId)
      .maybeSingle();
    if (!user) return res.status(404).json({ message: "User not found" });
    if (parseFloat(user.credits) < totalStake)
      return res.status(400).json({ message: "Insufficient credits" });
    let newCredits = parseFloat(user.credits) - totalStake;
    if (!Number.isFinite(newCredits)) newCredits = 0;
    // round to 2 decimals for storage
    newCredits = Number(
      (Math.round((newCredits + Number.EPSILON) * 100) / 100).toFixed(2)
    );
    const { error: updErr } = await supabaseAdmin
      .from("users")
      .update({ credits: newCredits })
      .eq("id", req.userId);
    if (updErr) throw updErr;
    // If client didn't provide a potentialPayout, compute it server-side
    let computedPotential = null;
    try {
      if (
        potentialPayout == null &&
        betslipData &&
        Array.isArray(betslipData.bets)
      ) {
        const decimalOdds = betslipData.bets.map((b) => {
          const s = b.odds == null ? null : String(b.odds).trim();
          if (s == null || s === "") return 1;
          // signed American integer like +150 / -2000
          if (/^[+-]?\d+$/.test(s)) {
            const n = parseFloat(s.replace(/^\+/, ""));
            if (n > 0) return n / 100 + 1;
            if (n <= -100) return 100 / Math.abs(n) + 1;
            return n; // fallback
          }
          // numeric/decimal odds
          const parsed = parseFloat(s);
          return isNaN(parsed) ? 1 : parsed;
        });
        const totalDecimal = decimalOdds.reduce((acc, v) => acc * v, 1);
        computedPotential = Number(
          ((totalStake || 0) * totalDecimal).toFixed(2)
        );
      }
    } catch (e) {
      console.warn(
        "[betslips] failed to compute potentialPayout server-side",
        e?.message || e
      );
      computedPotential = null;
    }

    const { data: inserted } = await supabaseAdmin
      .from("betslips")
      .insert({
        user_id: req.userId,
        betslip_data: betslipData,
        total_stake: totalStake,
        potential_payout:
          potentialPayout != null ? potentialPayout : computedPotential,
      })
      .select()
      .maybeSingle();
    await supabaseAdmin.from("bet_history").insert({
      user_id: req.userId,
      betslip_id: inserted.id,
      action: "placed",
      credits_change: -totalStake,
      credits_after: newCredits,
    });
    // Schedule automatic clearing 24 hours after creation
    try {
      scheduleClearBetslip(inserted);
    } catch (e) {
      console.warn("Failed to schedule betslip clear", e?.message || e);
    }
    // start watcher
    startWatcherInline(inserted.id);
    console.log(`[betslips] startWatcherInline called for ${inserted.id}`);
    if (betslipWatchers[inserted.id]) {
      console.log(`[betslips] watcher confirmed running for ${inserted.id}`);
    } else {
      console.warn(
        `[betslips] watcher not found after start attempt for ${inserted.id}`
      );
    }
    // start minute-based test notifier automatically for this betslip (short test)
    try {
      startTestNotifier(inserted.id);
      if (testNotifiers[inserted.id]) {
        console.log(`[betslips] testNotifier running for ${inserted.id}`);
      } else {
        console.warn(`[betslips] testNotifier not started for ${inserted.id}`);
      }
    } catch (e) {
      console.warn(
        "Failed to start test notifier for",
        inserted.id,
        e?.message || e
      );
    }
    // start minute-based test notifier automatically for this betslip
    try {
      // build a betslip URL and store it inside betslip_data so background workers
      // can fetch the aggregated betslip payload instead of hitting ESPN summary.
      try {
        const baseApi =
          process.env.PUBLIC_API_URL || `http://localhost:${PORT}`;
        const betsList =
          (inserted.betslip_data && inserted.betslip_data.bets) || [];
        let betslipUrl = null;
        if (betsList.length > 0) {
          const first = betsList[0];
          const params = new URLSearchParams();
          if (first.gameId) params.set("gameId", String(first.gameId));
          if (first.team || first.selection || first.teamCode) {
            params.set(
              "moneyline",
              first.team || first.selection || first.teamCode
            );
          }
          betslipUrl = `${baseApi.replace(
            /\/$/,
            ""
          )}/api/betslip?${params.toString()}`;
        }

        if (betslipUrl) {
          const updatedData = Object.assign({}, inserted.betslip_data, {
            betslip_url: betslipUrl,
          });
          await supabaseAdmin
            .from("betslips")
            .update({ betslip_data: updatedData })
            .eq("id", inserted.id);
          inserted.betslip_data = updatedData;
          console.log(
            `[betslips] persisted betslip_url for ${inserted.id}: ${betslipUrl}`
          );
        }
      } catch (e) {
        console.warn(
          "Failed to persist betslip_url for",
          inserted.id,
          e?.message || e
        );
      }
    } catch (e) {
      console.warn(
        "Failed to persist betslip_url for",
        inserted.id,
        e?.message || e
      );
    }
    res.status(201).json({
      message: "Bet placed",
      betslipId: inserted.id,
      creditsRemaining: newCredits,
    });
  } catch (e) {
    console.error("place bet", e);
    res.status(500).json({ message: "Server error" });
  }
});

// Debug minute-notifier endpoints removed.

app.get("/api/betslips", authMiddlewareInline, async (req, res) => {
  try {
    const { data } = await supabaseAdmin
      .from("betslips")
      .select("*")
      .eq("user_id", req.userId)
      .order("created_at", { ascending: false });
    res.json({ betslips: data || [] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
});

// Debug: send a test push notification to the caller's profile (or specified profileId)
app.post("/api/debug/push-test", authMiddlewareInline, async (req, res) => {
  try {
    const body = req.body || {};
    const targetProfileId = body.profileId || req.profileId || null;

    // If JWT includes profileId, prefer it
    let profileId = targetProfileId || null;
    if (!profileId && req.username) {
      // Try to resolve profileId from username
      try {
        const { data: prof } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("username", req.username)
          .maybeSingle();
        if (prof && prof.id) profileId = prof.id;
      } catch (e) {
        console.error("/api/debug/push-test profile lookup error", e);
      }
    }

    if (!profileId) {
      return res.status(400).json({ message: "profileId required" });
    }

    // fetch push tokens
    const { data: tokens, error: tokErr } = await supabaseAdmin
      .from("push_tokens")
      .select("expo_push_token, platform")
      .eq("user_id", profileId);
    if (tokErr) throw tokErr;
    if (!tokens || tokens.length === 0)
      return res.status(404).json({ message: "No push tokens for profile" });

    // send to each token
    const results = [];
    for (const t of tokens) {
      try {
        console.log(
          `[debug/push-test] notify -> profile:${profileId} title:${
            body.title || "Test"
          }`
        );
        await sendPushNotification(
          profileId,
          body.title || "Test",
          body.body || "This is a test notification",
          body.data || {}
        );
        results.push({ token: t.expo_push_token, status: "sent" });
      } catch (e) {
        console.error("/api/debug/push-test send error", e);
        results.push({
          token: t.expo_push_token,
          status: "error",
          error: e && e.message,
        });
      }
    }

    res.json({ success: true, results });
  } catch (e) {
    console.error("/api/debug/push-test error", e);
    res.status(500).json({ message: "Server error" });
  }
});

app.get("/api/betslips/:id", authMiddlewareInline, async (req, res) => {
  try {
    const { data } = await supabaseAdmin
      .from("betslips")
      .select("*")
      .eq("id", req.params.id)
      .maybeSingle();
    if (!data) return res.status(404).json({ message: "Betslip not found" });
    res.json({ betslip: data });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/betslips/:id/watch", authMiddlewareInline, async (req, res) => {
  const id = req.params.id;
  try {
    const { data } = await supabaseAdmin
      .from("betslips")
      .select("id, user_id")
      .eq("id", id)
      .maybeSingle();
    if (!data) return res.status(404).json({ message: "Betslip not found" });
    if (data.user_id !== req.userId)
      return res.status(403).json({ message: "Forbidden" });
    if (betslipWatchers[id]) return res.json({ message: "Already watching" });
    startWatcherInline(id);
    console.log(
      `[api/watch] startWatcherInline called for ${id} by user ${req.userId}`
    );
    if (betslipWatchers[id]) {
      console.log(`[api/watch] watcher active for ${id}`);
      return res.json({ message: "Watcher started" });
    }
    console.warn(
      `[api/watch] watcher start call returned but watcher not active for ${id}`
    );
    return res.status(500).json({ message: "Failed to start watcher" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
});

// --------------------------
// Internal debug endpoints (development only, guarded by DEBUG_INTERNAL=1)
// --------------------------
// internal debug start-minute-notifier endpoint removed (minute-notifier disabled)

app.post("/internal/debug/send-push-to-profile", async (req, res) => {
  if (process.env.DEBUG_INTERNAL !== "1")
    return res.status(403).json({ message: "disabled" });
  try {
    const { profileId, title, body: bodyText, data } = req.body || {};
    if (!profileId)
      return res.status(400).json({ message: "profileId required" });
    // Attempt to send a push using the same sendPushNotification helper
    console.log(
      `[internal/send-push-to-profile] notify -> profile:${profileId} title:${
        title || "Test"
      }`
    );
    await sendPushNotification(
      profileId,
      title || "Test",
      bodyText || "Test push",
      data || {}
    );
    return res.json({ sent: true, profileId });
  } catch (e) {
    console.error("internal send-push-to-profile error", e);
    return res.status(500).json({ message: "Server error" });
  }
});

// NOTE: debug minute-notifier endpoints removed; notifier starts automatically on bet placement for short testing.

// RevenueCat webhook endpoint: verify signature and persist event + attempt to link to profiles
app.post("/revenuecat/webhook", async (req, res) => {
  try {
    const raw = req.rawBody ? req.rawBody.toString() : null;
    const payload = raw ? JSON.parse(raw) : req.body;

    const signatureHeader =
      (req.headers["x-revenuecat-signature"] ||
        req.headers["revenuecat-signature"] ||
        "") + "";
    const secret = process.env.REVENUECAT_WEBHOOK_SECRET || null;

    if (secret && raw) {
      const expected = crypto
        .createHmac("sha256", secret)
        .update(raw)
        .digest("hex");
      if (!signatureHeader || signatureHeader !== expected) {
        console.warn("RevenueCat webhook signature mismatch", {
          got: signatureHeader,
          expected: expected,
        });
        return res
          .status(401)
          .json({ ok: false, message: "invalid signature" });
      }
    } else if (!secret) {
      console.warn(
        "REVENUECAT_WEBHOOK_SECRET not set; skipping signature verification"
      );
    }

    const appUserId =
      payload?.app_user_id ||
      payload?.data?.app_user_id ||
      payload?.subscriber?.app_user_id ||
      null;
    const eventType = payload?.type || payload?.event || "revenuecat.event";
    const productId =
      payload?.data?.product_id ||
      payload?.data?.product_identifier ||
      payload?.data?.store_product_id ||
      null;

    // Persist raw event into a revenue_events table for later inspection (if table exists)
    try {
      await supabaseAdmin.from("revenue_events").insert({
        revenuecat_id: appUserId,
        event_type: eventType,
        product_id: productId,
        payload: payload,
      });
    } catch (e) {
      console.warn(
        "revenue_events insert failed (table may not exist)",
        e?.message || e
      );
    }

    // If appUserId looks like a UUID, attempt to link to profiles table and mark pro status
    try {
      // Determine entitlements from payload (defensive parsing)
      let entitlements =
        payload?.subscriber?.entitlements ||
        payload?.data?.entitlements ||
        null;

      // Helper: decide if user currently has an active pro entitlement
      let hasActive = false;
      let latestExpiry = null;
      if (entitlements && typeof entitlements === "object") {
        for (const k of Object.keys(entitlements)) {
          const ent = entitlements[k] || {};
          // common expiry fields
          const expiryStr =
            ent.expires_date ||
            ent.expiration_date ||
            ent.expires_at ||
            ent.expire_date ||
            null;
          const isActiveFlag = ent.is_active || ent.active || null;
          if (expiryStr) {
            const ex = new Date(expiryStr);
            if (!isNaN(ex.getTime())) {
              if (ex.getTime() > Date.now()) {
                hasActive = true;
                if (
                  !latestExpiry ||
                  ex.getTime() > new Date(latestExpiry).getTime()
                ) {
                  latestExpiry = ex.toISOString();
                }
              }
            }
          } else if (isActiveFlag) {
            if (isActiveFlag === true) hasActive = true;
          }
        }
      } else {
        // Fallback heuristics: purchase events imply active
        if (/(purchase|initial_purchase|INITIAL_PURCHASE)/i.test(eventType)) {
          hasActive = true;
        }
      }

      // locate profile either by id (uuid) or by revenuecat_id mapping
      let profileLookupId = null;
      let prof = null;
      if (appUserId && typeof appUserId === "string") {
        // If appUserId looks like a UUID, prefer direct id lookup
        if (appUserId.includes("-")) {
          profileLookupId = appUserId;
        } else {
          // try to find profile by stored revenuecat_id
          try {
            const { data: found, error: foundErr } = await supabaseAdmin
              .from("profiles")
              .select("id")
              .eq("revenuecat_id", appUserId)
              .maybeSingle();
            if (!foundErr && found) profileLookupId = found.id;
          } catch (e) {
            // ignore
          }
        }
      }

      if (profileLookupId) {
        const { data: profRow, error: profErr } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("id", profileLookupId)
          .maybeSingle();
        if (!profErr && profRow) prof = profRow;
      }

      if (prof) {
        // Attempt to update mapping and pro metadata
        try {
          await supabaseAdmin
            .from("profiles")
            .update({ revenuecat_id: appUserId })
            .eq("id", prof.id);
        } catch (e) {
          // ignore if column missing
        }

        try {
          const updateObj = {
            is_pro: !!hasActive,
            pro_expires_at: latestExpiry || null,
            pro_product_id: productId || null,
            pro_source: "revenuecat",
          };
          await supabaseAdmin
            .from("profiles")
            .update(updateObj)
            .eq("id", prof.id);
        } catch (e) {
          console.warn(
            "Failed to update profile pro metadata",
            e?.message || e
          );
        }
      }
    } catch (e) {
      console.warn(
        "RevenueCat webhook profile link attempt failed",
        e?.message || e
      );
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error("/revenuecat/webhook error", e?.message || e);
    return res.status(500).json({ ok: false });
  }
});

// Admin: grant or revoke `is_pro` for a profile (requires auth)
app.post("/api/admin/pro", authMiddlewareInline, async (req, res) => {
  try {
    const { profile_id, is_pro } = req.body || {};
    if (!profile_id)
      return res.status(400).json({ message: "profile_id required" });
    const val = !!is_pro;
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update({ is_pro: val })
      .eq("id", profile_id)
      .select("id, is_pro")
      .maybeSingle();
    if (error) {
      console.error("/api/admin/pro update error", error);
      return res.status(500).json({ message: "update failed" });
    }
    return res.json({ ok: true, profile: data });
  } catch (e) {
    console.error("/api/admin/pro error", e?.message || e);
    return res.status(500).json({ message: "server error" });
  }
});

// Promo code redeem endpoint: authenticated users can redeem a code to get pro
app.post("/api/promo/redeem", authMiddlewareInline, async (req, res) => {
  try {
    const { code } = req.body || {};
    if (!code) return res.status(400).json({ message: "code required" });

    // Look up code (include type and metadata so we can honor duration)
    const { data: promoRows, error: promoErr } = await supabaseAdmin
      .from("promo_codes")
      .select("code, uses, max_uses, expires_at, type, metadata")
      .eq("code", code)
      .limit(1)
      .maybeSingle();
    if (promoErr) {
      console.error("promo lookup failed", promoErr);
      return res.status(500).json({ message: "lookup failed" });
    }
    const promo = promoRows;
    // Parse metadata if present (may be stored as JSON string)
    let promoMeta = null;
    try {
      if (promo && promo.metadata) {
        if (typeof promo.metadata === "string") {
          try {
            promoMeta = JSON.parse(promo.metadata);
          } catch (e) {
            promoMeta = null;
          }
        } else if (typeof promo.metadata === "object") {
          promoMeta = promo.metadata;
        }
      }
    } catch (e) {
      promoMeta = null;
    }
    if (!promo) return res.status(404).json({ message: "code not found" });

    // Check expiry
    if (promo.expires_at && new Date(promo.expires_at) < new Date())
      return res.status(400).json({ message: "code expired" });

    // Check uses (we track remaining uses in `uses`)
    const remaining = Number(promo.uses || 0);
    if (remaining <= 0)
      return res.status(400).json({ message: "code exhausted" });

    // Mark profile as pro (type-aware)
    const profileId = req.userId;
    if (!profileId) return res.status(401).json({ message: "Unauthorized" });

    // Fetch current profile to check existing pro status
    let profileRow = null;
    try {
      const { data: p, error: pErr } = await supabaseAdmin
        .from("profiles")
        .select("id, is_pro")
        .eq("id", profileId)
        .maybeSingle();
      if (pErr) {
        console.warn("promo redeem: profile lookup failed", pErr);
      } else {
        profileRow = p;
      }
    } catch (e) {
      console.warn("promo redeem: profile lookup exception", e?.message || e);
    }

    if (profileRow && profileRow.is_pro) {
      return res.status(400).json({ message: "already_pro" });
    }

    const updates = {};
    const promoType = (
      promo.type ||
      (promoMeta && promoMeta.type) ||
      "lifetime"
    ).toString();
    // Determine expiry based on promo type (monthly/yearly/lifetime)
    let expiresAt = null;
    try {
      const now = new Date();
      if (/month/i.test(promoType)) {
        const d = new Date(now);
        d.setMonth(d.getMonth() + 1);
        expiresAt = d.toISOString();
      } else if (/year|annual/i.test(promoType)) {
        const d = new Date(now);
        d.setFullYear(d.getFullYear() + 1);
        expiresAt = d.toISOString();
      } else {
        // lifetime or unknown types -> no expiry
        expiresAt = null;
      }
    } catch (e) {
      expiresAt = null;
    }

    updates.is_pro = true;
    updates.pro_source = "promo";
    updates.pro_expires_at = expiresAt;
    updates.pro_product_id = promoType || null;

    const { data: upd, error: updErr } = await supabaseAdmin
      .from("profiles")
      .update(updates)
      .eq("id", profileId)
      .select("id, is_pro, pro_expires_at, pro_product_id, pro_source")
      .maybeSingle();
    if (updErr) {
      console.error("promo redeem: profile update failed", updErr);
      return res.status(500).json({ message: "failed to set pro" });
    }

    // Decrement remaining uses (best-effort, not strictly transactional)
    try {
      await supabaseAdmin
        .from("promo_codes")
        .update({ uses: Math.max(0, remaining - 1) })
        .eq("code", code);
    } catch (e) {
      console.warn("promo decrement failed", e?.message || e);
    }

    // Fetch updated promo row for response
    let updatedPromo = null;
    try {
      const { data: pr, error: prErr } = await supabaseAdmin
        .from("promo_codes")
        .select("code, uses, type, expires_at")
        .eq("code", code)
        .maybeSingle();
      if (!prErr) updatedPromo = pr;
    } catch (e) {
      /* ignore */
    }

    // Insert audit row
    try {
      await supabaseAdmin.from("revenue_events").insert({
        revenuecat_id: profileId,
        event_type: "promo.redeemed",
        product_id: code,
        payload: { profile: profileId, code },
      });
    } catch (e) {
      /* ignore */
    }

    return res.json({ ok: true, profile: upd, promo: updatedPromo });
  } catch (e) {
    console.error("/api/promo/redeem error", e?.message || e);
    return res.status(500).json({ message: "server error" });
  }
});

app.delete(
  "/api/betslips/:id/watch",
  authMiddlewareInline,
  async (req, res) => {
    const id = req.params.id;
    try {
      if (!betslipWatchers[id]) return res.json({ watching: false });
      clearInterval(betslipWatchers[id].intervalId);
      delete betslipWatchers[id];
      console.log(
        `[api/watch] stopped watcher for ${id} by user ${req.userId}`
      );
      res.json({ watching: false });
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Authentication API: http://localhost:${PORT}/api/auth`);
  console.log(`Betslips API: http://localhost:${PORT}/api/betslips`);
  initialize();
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM signal received. Closing HTTP server...");

  // Clear all intervals
  if (currentScoreboardInterval) {
    clearInterval(currentScoreboardInterval);
  }

  Object.values(currentSummaryIntervals).forEach((interval) => {
    clearInterval(interval);
  });

  if (rostersScoreboardInterval) {
    clearInterval(rostersScoreboardInterval);
  }

  process.exit(0);
});

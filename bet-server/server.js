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
const path = require("path");
const fs = require("fs");

// Create Supabase admin client from env
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.\n" +
      "Create a .env file in the bet-server folder with the following values, then restart the server:\n" +
      "SUPABASE_URL=https://your-project.supabase.co\n" +
      "SUPABASE_SERVICE_ROLE_KEY=your_service_role_key",
  );
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

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
        error,
      );
    } else {
      console.log(`[betslip-cleaner] deleted betslip ${betslipId}`);
    }
  } catch (e) {
    console.error(
      "[betslip-cleaner] error clearing betslip",
      betslipId,
      e?.message || e,
    );
  } finally {
    try {
      if (betslipCleanupTimers[betslipId]) {
        clearTimeout(betslipCleanupTimers[betslipId]);
        delete betslipCleanupTimers[betslipId];
      }
    } catch (e) {}
  }

  // (drives handling moved into transformSummaryData where `data` and `isNFL` are available)
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
        delay / 1000,
      )}s`,
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
  setInterval(
    async () => {
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
    },
    15 * 60 * 1000,
  );
}

// Initialize cleaner asynchronously (don't block startup)
initBetslipCleaner().catch((e) => console.error("initBetslipCleaner", e));

const expo = new Expo();

// Helper: determine whether a profile should be considered active pro
function isActivePro(profileRow) {
  if (!profileRow) return false;
  if (!profileRow.is_pro) return false;
  if (!profileRow.pro_expires_at) return true;
  try {
    return new Date(profileRow.pro_expires_at) > new Date();
  } catch (e) {
    return true;
  }
}

// Periodic cleanup: clear `is_pro` for rows whose `pro_expires_at` has passed.
async function cleanupExpiredPro() {
  try {
    const nowISO = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update({ is_pro: false })
      .lt("pro_expires_at", nowISO)
      .eq("is_pro", true);
    if (error) {
      console.error("cleanupExpiredPro error", error);
    } else if (data && data.length) {
      console.log(
        "cleanupExpiredPro: cleared pro for",
        data.length,
        "profiles",
      );
    }
  } catch (e) {
    console.error("cleanupExpiredPro exception", e?.message || e);
  }
}

// Run cleanup on startup and every 15 minutes
cleanupExpiredPro().catch((e) => console.error("cleanupExpiredPro startup", e));
setInterval(cleanupExpiredPro, 15 * 60 * 1000);

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
              e?.message || e,
            );
          }

          const stake =
            parseFloat(
              bs.total_stake ||
                bs.amount ||
                (typeof bs.betslip_data === "object"
                  ? bs.betslip_data?.total_stake
                  : NaN),
            ) || 0;

          const potential = parseFloat(
            bs.potential_payout ||
              (typeof bs.betslip_data === "object"
                ? bs.betslip_data?.potential_payout
                : bs.potential_payout),
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
                ? `Congrats! Your ${
                    legsCount || ""
                  } leg bet has won! You've won ${potentialRounded} credits!`
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
        e?.message || e,
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
        e?.message || e,
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
        pushTokens.push(...data.map((t) => t.expo_push_token));
      }
    }

    if (!pushTokens.length && userId) {
      const { data, error } = await supabaseAdmin
        .from("push_tokens")
        .select("expo_push_token")
        .eq("user_id", userId);

      if (!error && data?.length) {
        pushTokens.push(...data.map((t) => t.expo_push_token));
      }
    }

    // Deduplicate + validate
    pushTokens = [...new Set(pushTokens.filter(Expo.isExpoPushToken))];

    if (!pushTokens.length) {
      console.log(
        "No valid push tokens for user",
        userId,
        "resolvedProfileId",
        resolvedProfileId,
      );
      return;
    }

    // ================================================================
    // Send push to ALL devices
    // ================================================================
    const messages = pushTokens.map((token) => ({
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

        tickets.forEach((ticket) => {
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
        insErr?.message || insErr,
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
      } token(s)`,
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
      `[sendBetResultNotification] delegating -> user:${userId} betslip:${betslipId}`,
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
        bsErr,
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
          profErr,
        );
      }
      const profile = (profRows && profRows[0]) || null;
      const currentCredits = Number(profile?.credits || 0);
      let newCredits = currentCredits + payout;
      if (!Number.isFinite(newCredits)) newCredits = 0;
      newCredits = Number(
        (Math.round((newCredits + Number.EPSILON) * 100) / 100).toFixed(2),
      );
      const { data: updProf, error: updProfErr } = await supabaseAdmin
        .from("profiles")
        .update({ credits: newCredits })
        .eq("id", fresh.user_id);
      if (updProfErr) {
        console.error(
          `[manualSettleBetslip] failed to update profile ${fresh.user_id}`,
          updProfErr,
        );
      } else {
        console.log(
          `[manualSettleBetslip] profile ${fresh.user_id} credited -> ${newCredits}`,
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
          ledgerErr,
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
          bhErr,
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
        updBetslipErr,
      );
    } else {
      console.log(
        `[manualSettleBetslip] updated betslip ${betslipId}`,
        updBetslip && updBetslip[0] ? updBetslip[0] : updBetslip,
      );
    }

    console.log(
      `[manualSettleBetslip] settled ${betslipId} -> ${result} payout=${payout}`,
    );
  } catch (e) {
    console.error(
      `[manualSettleBetslip] error settling ${betslipId}:`,
      e?.message || e,
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
  }),
);

// Helper: parse gamelog into recent games and season averages
function parseGamelogIntoGames(gamelog, limit = 10) {
  if (!gamelog) return { recentGames: [], seasonAverages: null, allGames: [] };
  const debugEnabledLocal = process.env.DEBUG_SGO_MATCH === "1";
  const labels = gamelog.labels || [];
  const names = gamelog.names || [];
  const displayNames = gamelog.displayNames || [];
  const eventsObj = gamelog.events || [];
  const eventsArray = Array.isArray(eventsObj)
    ? eventsObj.slice()
    : Object.values(eventsObj || {});

  const sortedEvents = eventsArray.sort(
    (a, b) => new Date(b.gameDate) - new Date(a.gameDate),
  );
  const seasonTypes = gamelog.seasonTypes || [];

  // Build eventId -> stats map by scanning seasonTypes/categories/events
  // Approach:
  // 1) Build an abbreviation -> [eventId] map from the top-level `events` object
  // 2) Iterate seasonTypes/categories/events and for each entry try to:
  //    a) extract explicit event ids (eventId, id, gameId, etc.) and map
  //       those to top-level event ids
  //    b) if no explicit id, extract team/opponent abbreviations from the
  //       seasonTypes entry and use the abbrev->eventId map to resolve which
  //       top-level event this seasonTypes entry refers to, then attach stats
  const eventStatsMap = {};
  const abbrevToEventIds = {};
  eventsArray.forEach((ev) => {
    const evId = String(ev.id);
    const evAbbrevs = [ev.team?.abbreviation, ev.opponent?.abbreviation]
      .filter(Boolean)
      .map((s) => String(s).toUpperCase());
    evAbbrevs.forEach((a) => {
      if (!abbrevToEventIds[a]) abbrevToEventIds[a] = [];
      abbrevToEventIds[a].push(evId);
    });
  });

  const debugInfo = debugEnabledLocal
    ? { checkedSeasonEvents: 0, resolvedByAbbrev: {}, missing: [] }
    : null;

  // When debugging, expose the top-level events list so callers can verify
  // we correctly parsed the gamelog `events` object. For each event include
  // only `id` and the `opponent` object (id, abbreviation, displayName).
  if (debugEnabledLocal && debugInfo) {
    try {
      eventsArray.forEach((ev) => {
        try {
          debugInfo.resolvedByAbbrev[String(ev.id)] = {
            id: ev.id,
            opponent: ev.opponent
              ? {
                  id: ev.opponent.id || null,
                  abbreviation: ev.opponent.abbreviation || null,
                  displayName: ev.opponent.displayName || null,
                }
              : null,
          };
        } catch (e) {
          /* ignore per-event mapping errors */
        }
      });
    } catch (e) {
      /* ignore debug mapping errors */
    }
  }

  function extractAbbrevsFrom(obj, found = []) {
    if (!obj || typeof obj !== "object") return found;
    for (const k of Object.keys(obj)) {
      try {
        const v = obj[k];
        if (!v) continue;
        const lk = String(k).toLowerCase();
        if (/(abbrev|abbreviation|abbr)/i.test(lk) && typeof v === "string") {
          found.push(String(v).toUpperCase());
        } else if (typeof v === "object") {
          extractAbbrevsFrom(v, found);
        }
      } catch (e) {
        /* ignore */
      }
    }
    return found;
  }

  seasonTypes.forEach((seasonType) => {
    const categories = seasonType.categories || [];
    categories.forEach((category) => {
      const categoryEvents = category.events || [];
      categoryEvents.forEach((eventData) => {
        debugInfo && (debugInfo.checkedSeasonEvents += 1);
        try {
          const candidates = [eventData];
          if (eventData && typeof eventData === "object") {
            if (eventData.event && typeof eventData.event === "object")
              candidates.push(eventData.event);
          }
          let attached = false;
          for (const cand of candidates) {
            if (!cand || typeof cand !== "object") continue;
            const possibleIds = [
              cand.eventId,
              cand.eventID,
              cand.event_id,
              cand.id,
              cand.gameId,
              cand.gameID,
              cand.game_id,
            ]
              .filter((v) => v !== undefined && v !== null)
              .map((v) => String(v));
            // If there are explicit ids, map them directly
            for (const pid of possibleIds) {
              // pid might already be the top-level id; otherwise try to find
              // a matching top-level event by id
              const match = eventsArray.find((ev) => String(ev.id) === pid);
              if (match) {
                const stats = cand.stats || eventData.stats || [];
                const formatted = {};
                for (let i = 0; i < stats.length; i++) {
                  const key =
                    (displayNames && displayNames[i]) ||
                    (names && names[i]) ||
                    (labels && labels[i]) ||
                    String(i);
                  if (stats[i] !== undefined) formatted[key] = stats[i];
                }
                if (Object.keys(formatted).length > 0) {
                  eventStatsMap[match.id] = formatted;
                  attached = true;
                  if (debugEnabledLocal) {
                    debugInfo.matched[match.id] = {
                      seasonType:
                        seasonType.displayName || seasonType.type || null,
                      keys: Object.keys(formatted),
                      resolvedFrom: "explicit-id",
                    };
                  }
                  break;
                }
              }
            }
            if (attached) break;
          }
          if (attached) return;

          // No explicit ids matched: try resolving by abbreviation keys found
          const abbrevs = extractAbbrevsFrom(eventData || {}).concat(
            eventData.team?.abbreviation
              ? [String(eventData.team.abbreviation).toUpperCase()]
              : [],
            eventData.opponent?.abbreviation
              ? [String(eventData.opponent.abbreviation).toUpperCase()]
              : [],
          );
          for (const a of abbrevs) {
            const mapped = abbrevToEventIds[a] || [];
            if (mapped.length > 0) {
              // Attach stats to all matching event ids for this abbrev
              const candStats =
                eventData.stats ||
                (eventData.event && eventData.event.stats) ||
                [];
              const formatted = {};
              for (let i = 0; i < candStats.length; i++) {
                const key =
                  (displayNames && displayNames[i]) ||
                  (names && names[i]) ||
                  (labels && labels[i]) ||
                  String(i);
                if (candStats[i] !== undefined) formatted[key] = candStats[i];
              }
              if (Object.keys(formatted).length > 0) {
                mapped.forEach((mid) => {
                  eventStatsMap[mid] = formatted;
                  if (debugEnabledLocal) {
                    debugInfo.resolvedByAbbrev[mid] = {
                      seasonType:
                        seasonType.displayName || seasonType.type || null,
                      keys: Object.keys(formatted),
                      abbrev: a,
                    };
                  }
                });
              }
              break;
            }
          }
        } catch (e) {
          /* ignore and continue */
        }
      });
    });
  });

  // After processing seasonTypes, record any top-level events that remain without stats
  const sortedEventIds = sortedEvents.map((e) => e.id);
  if (debugEnabledLocal) {
    sortedEventIds.forEach((eventId) => {
      if (!eventStatsMap[eventId]) debugInfo.missing.push(String(eventId));
    });
  }
  const recentWithStats = [];
  for (const ev of sortedEvents) {
    if (recentWithStats.length >= limit) break;
    const statsForEv = eventStatsMap[ev.id];
    if (statsForEv && Object.keys(statsForEv).length > 0) {
      recentWithStats.push({ event: ev, stats: statsForEv });
    }
  }

  // attach stats to all games so callers can compute season totals
  const allGamesWithStats = sortedEvents.map((ev) => ({
    ...ev,
    stats: eventStatsMap[ev.id] || null,
  }));

  const recentGames = recentWithStats.map(({ event, stats }) => ({
    id: event.id,
    atVs: event.atVs,
    gameDate: event.gameDate,
    score: event.score,
    gameResult: event.gameResult,
    opponent: {
      id: event.opponent?.id || null,
      displayName: event.opponent?.displayName || null,
      abbreviation: event.opponent?.abbreviation || null,
    },
    stats: stats,
  }));

  // Season averages: try to find summary 'Averages' in seasonTypes
  let seasonAverages = null;
  seasonTypes.forEach((seasonType) => {
    if (seasonType.summary && seasonType.summary.stats) {
      const summaryStats = seasonType.summary.stats || [];
      summaryStats.forEach((summaryItem) => {
        if (summaryItem.displayName === "Averages") {
          const stats = summaryItem.stats || [];
          const formatted = {};
          labels.forEach((label, index) => {
            if (stats[index] !== undefined) formatted[label] = stats[index];
          });
          seasonAverages = formatted;
        }
      });
    }
  });

  const result = { recentGames, seasonAverages, allGames: allGamesWithStats };
  if (debugEnabledLocal) {
    // Ensure we don't expose the previous 'matched' structure — caller wants
    // only the resolvedByAbbrev listing of top-level events.
    if (debugInfo && debugInfo.matched) delete debugInfo.matched;
    result.gamelogDebug = debugInfo;
  }
  return result;
}

// Helper: compute numeric stat value for a game given gamelog stats and desired statID
function computeStatValueForGame(
  statsMap,
  labels,
  statID,
  sportKey,
  allowComposite = true,
) {
  if (!statsMap) return null;
  const normalize = (s) => String(s || "").toLowerCase();
  const debugEnabled = process.env.DEBUG_SGO_MATCH === "1";
  if (debugEnabled) {
    try {
      console.debug(
        `[computeStatValueForGame] statID=${statID} sport=${sportKey} keys=${Object.keys(
          statsMap || {},
        )
          .slice(0, 50)
          .join(",")}`,
      );
    } catch (e) {
      /* swallow debug errors */
    }
  }
  // Special-case: NFL aggregated touchdowns should sum receiving, rushing, interception touchdowns
  if (sportKey === "nfl" && statID === "touchdowns") {
    try {
      const tdRegexes = [
        /receiv(e|ing)?.*touchdown|receiving\s*touchdowns|receiving\s*touchdown/i,
        /rush(ing)?.*touchdown|rushing\s*touchdowns|rushing\s*touchdown/i,
        /interception.*touchdown|interception\s*touchdowns|interception\s*touchdown/i,
      ];
      let sum = 0;
      let found = 0;
      for (const key of Object.keys(statsMap || {})) {
        const val = Number(statsMap[key]);
        if (isNaN(val)) continue;
        for (const rx of tdRegexes) {
          if (rx.test(key)) {
            sum += val;
            found++;
            break;
          }
        }
      }
      if (found > 0) {
        if (debugEnabled)
          console.debug(
            `[computeStatValueForGame] NFL touchdowns aggregated value=${sum} foundParts=${found}`,
          );
        return sum;
      }
    } catch (e) {
      /* ignore and fallthrough to normal handling */
    }
  }

  // Composite statIDs like 'points+assists'
  if (allowComposite && statID && statID.includes("+")) {
    const parts = statID.split("+").map((p) => p.trim());
    let sum = 0;
    let foundAny = false;
    for (const part of parts) {
      // Try several candidate forms for the stat part to match ESPN displayNames
      const candidates = [
        part,
        part.replace(/_/g, " "),
        part.replace(/_/g, ""),
        `${part}_yards`,
        `${part.replace(/_/g, "")}yards`,
      ];
      let partVal = null;
      for (const c of candidates) {
        const v = computeStatValueForGame(statsMap, labels, c, sportKey, false);
        if (v !== null && !isNaN(v)) {
          partVal = Number(v);
          break;
        }
      }
      if (partVal !== null) {
        sum += partVal;
        foundAny = true;
      }
    }
    return foundAny ? sum : null;
  }

  // Map common statIDs to label regexes per sport
  const STAT_LABEL_MAP = {
    nba: {
      points: /pts|points/i,
      assists: /ast|assists/i,
      rebounds: /reb|rebounds/i,
      steals: /stl|steals/i,
      threePointersMade: /3pt|three/i,
      doubleDouble: /double/i,
      tripleDouble: /triple/i,
      blocks: /blk|blocks/i,
    },
    nhl: {
      goals: /goals|g$/i,
      shots_onGoal: /shots on goal|sog|shots|shots on goal/i,
      shots: /shots on goal|sog|shots/i,
      assists: /assists|a$/i,
      points: /points|pts|g\+a/i,
      powerPlay_goals: /power play goals|power play goal|ppg/i,
      powerPlay_assists: /power play assists|power play assist|ppa/i,
      powerPlayPoints: /power play|ppp|pppts/i,
      anyGoal: /goals|g$/i,
      goalie_saves: /saves|save|saves$/i,
    },
    nfl: {
      // NFL-specific stat label mappings
      passing_yards: /pass(ing)?\b.*(yds|yards)|pass\s*yds|passing\s*yards/i,
      passing_attempts: /att|attempts|passing\s*att/i,
      passing_completions: /comp|completions|passing\s*comp/i,
      passing_interceptions: /int|interceptions/i,
      passing_touchdowns: /pass(ing)?\b.*(td|touchdown)|passing.*td/i,

      rushing_yards: /rush(ing)?\b.*(yds|yards)|rush\s*yds|rushing\s*yards/i,
      rushing_longestRush: /long(est)?\b.*rush|longest.*rush/i,

      receiving_yards: /rec(eiving)?\b.*(yds|yards)|receiving\s*yds|rec\s*yds/i,
      receiving_longestReception:
        /long(est)?\b.*recept|longest.*rec|longest.*reception/i,
      receiving_receptions: /rec|receptions|recs?/i,

      extraPoints_kicksMade: /extra\s*point.*made|xpm|extra\s*points?\s*made/i,
      fieldGoals_made: /field\s*goal|fgm|fieldgoals?\s*made|fg\s*made/i,
      kicking_totalPoints:
        /kicking\b.*points|kicking\s*points|kicking\s*total/i,

      defense_sacks: /sack|sacks/i,
      defense_combinedTackles: /total\s*tackles?|combined\s*tackles?/i,
      defense_soloTackles: /solo\s*tackles?/i,
      defense_assistedTackles: /assisted\s*tackles?|ast\s*tackles?/i,

      // generic fallbacks
      passing: /pass(ing)?\b.*(yds|yards)|pass\s*yds|passing\s*yards/i,
      rushing: /rush(ing)?\b.*(yds|yards)|rush\s*yds|rushing\s*yards/i,
      receiving: /rec(eiving)?\b.*(yds|yards)|receiving\s*yds|rec\s*yds/i,
      touchdowns: /td|touchdown/i,
    },
  };

  const map = STAT_LABEL_MAP[sportKey] || {};
  let regex = null;
  if (map[statID]) regex = map[statID];
  else regex = new RegExp(statID.replace(/[^a-z0-9]/gi, ""), "i");

  // Special handling for NBA double/triple double: return count of stat categories >=10
  if (
    sportKey === "nba" &&
    (statID === "doubleDouble" || statID === "tripleDouble")
  ) {
    const lookups = {
      points: /pts|points/i,
      rebounds: /reb|rebounds/i,
      assists: /ast|assists/i,
      steals: /stl|steals/i,
      blocks: /blk|blocks/i,
    };
    let cnt = 0;
    for (const rx of Object.values(lookups)) {
      for (const label of Object.keys(statsMap || {})) {
        if (!label) continue;
        if (rx.test(label)) {
          const v = statsMap[label];
          const n = Number(
            v && typeof v === "object" && v.value !== undefined ? v.value : v,
          );
          if (!isNaN(n) && n >= 10) cnt++;
          break;
        }
      }
    }
    return cnt; // caller can interpret >=2 as double-double, >=3 triple-double
  }

  // Find first matching label
  for (const label of Object.keys(statsMap || {})) {
    if (!label) continue;
    if (regex.test(label)) {
      const val = statsMap[label];
      const num = Number(val);
      if (!isNaN(num)) {
        if (debugEnabled) {
          try {
            console.debug(
              `[computeStatValueForGame] MATCH statID=${statID} sport=${sportKey} label=${label} value=${num}`,
            );
          } catch (e) {}
        }
        return num;
      }
      // If value is a string like "1-6" or "1/6", extract the made number before the dash/slash
      try {
        if (typeof val === "string") {
          const m = String(val).match(/^\s*([0-9]+)\s*[-\/–—]/);
          if (m && m[1]) {
            const parsed = parseInt(m[1], 10) || 0;
            console.log(
              `[computeStatValueForGame] PARSE-MADE statID=${statID} label=${label} raw='${val}' made=${parsed}`,
            );
            return parsed;
          }
        }
        // also handle nested objects with displayValue or value as strings like { displayValue: '1-6' }
        if (typeof val === "object" && val !== null) {
          const cand =
            val.displayValue || val.value || val.count || val.total || null;
          if (typeof cand === "string") {
            const m2 = String(cand).match(/^\s*([0-9]+)\s*[-\/–—]/);
            if (m2 && m2[1]) {
              const parsed2 = parseInt(m2[1], 10) || 0;
              if (debugEnabled)
                console.debug(
                  `[computeStatValueForGame] PARSE-MADE nested statID=${statID} label=${label} raw='${cand}' made=${parsed2}`,
                );
              return parsed2;
            }
          }
        }
      } catch (e) {}
      // sometimes stats are objects
      if (typeof val === "object" && val !== null) {
        if (val.value !== undefined) return Number(val.value);
      }
    }
  }

  if (debugEnabled) {
    try {
      console.debug(
        `[computeStatValueForGame] NO MATCH statID=${statID} sport=${sportKey} keys=${Object.keys(
          statsMap || {},
        )
          .slice(0, 50)
          .join(",")}`,
      );
    } catch (e) {
      /* swallow debug errors */
    }
  }
  return null;
}

// New endpoint: athlete detail with gamelog and odds breakdown
app.get("/api/athlete/:sport/:id", async (req, res) => {
  try {
    const sportKey = String(req.params.sport || "nba").toLowerCase();
    const athleteId = String(req.params.id || "").trim();
    if (!athleteId)
      return res.status(400).json({ error: "athlete id required" });

    // Ensure roster cache is available
    if (!rosterCache[sportKey] || !rosterCache[sportKey].data) {
      await fetchRostersForSport(sportKey);
    }

    const rosterData = rosterCache[sportKey]?.data;
    if (!rosterData)
      return res.status(503).json({ error: "roster data not available" });

    try {
      // copy per-period stat objects (e.g., '1Q','2Q') into the nested athlete meta
      // so resolvePlayerStatValue can find period stats via athleteObj
      if (athlete && athlete.athlete) {
        Object.keys(athlete || {}).forEach((k) => {
          try {
            if (/^[0-9]+Q$/.test(String(k))) {
              athlete.athlete[k] = athlete[k];
            }
          } catch (e) {}
        });
      }
    } catch (e) {}
    // Find athlete and team
    let found = null;
    for (const t of rosterData.teams || []) {
      const athletes = (t.roster && t.roster.athletes) || [];
      for (const a of athletes) {
        if (!a) continue;
        if (String(a.id) === athleteId) {
          found = {
            athlete: a,
            team: t.team || null,
            opponentId: t.opponentId || null,
          };
          break;
        }
      }
      if (found) break;
    }

    if (!found) {
      return res.status(404).json({ error: "athlete not found in rosters" });
    }

    const athlete = found.athlete;
    const team = found.team;

    // Ensure odds are fresh for this athlete
    const oddsMarkets =
      getPlayerOddsFromCache(sportKey, athlete) || athlete.odds || [];

    // Fetch gamelog from ESPN web API for the sport
    const webBase =
      (ESPN_PATHS[sportKey] && ESPN_PATHS[sportKey].web) || ESPN_WEB_API_URL;
    let gamelog = null;
    try {
      const resp = await axios.get(`${webBase}/athletes/${athleteId}/gamelog`);
      gamelog = resp.data;
    } catch (e) {
      console.warn(
        `[Athlete:${sportKey}] failed to fetch gamelog for ${athleteId}:`,
        e?.message || e,
      );
    }

    const parsedGamelog = parseGamelogIntoGames(gamelog, 20);
    let { recentGames, seasonAverages, allGames, gamelogDebug } = parsedGamelog;
    let computedSeasonAverages = seasonAverages;
    // If ESPN didn't provide season averages for NFL, compute simple averages from allGames
    if (!computedSeasonAverages && sportKey === "nfl") {
      try {
        const gamesWithStats = Array.isArray(allGames)
          ? allGames.filter(
              (eg) => eg && eg.stats && Object.keys(eg.stats || {}).length > 0,
            )
          : [];
        const sums = {};
        const counts = {};
        for (const g of gamesWithStats) {
          for (const [k, v] of Object.entries(g.stats || {})) {
            const num = Number(
              typeof v === "object" && v !== null && v.value !== undefined
                ? v.value
                : v,
            );
            if (!isNaN(num)) {
              sums[k] = (sums[k] || 0) + num;
              counts[k] = (counts[k] || 0) + 1;
            }
          }
        }
        const avg = {};
        for (const k of Object.keys(sums)) {
          const c = counts[k] || 1;
          avg[k] = Number((sums[k] / c).toFixed(1));
        }
        computedSeasonAverages = Object.keys(avg).length > 0 ? avg : null;
      } catch (e) {
        console.warn(
          `[Athlete:${sportKey}] failed to compute season averages:`,
          e?.message || e,
        );
        computedSeasonAverages = null;
      }
    }
    // If ESPN didn't provide season averages for NHL, compute simple averages from allGames
    if (!computedSeasonAverages && sportKey === "nhl") {
      try {
        const gamesWithStats = Array.isArray(allGames)
          ? allGames.filter(
              (eg) => eg && eg.stats && Object.keys(eg.stats || {}).length > 0,
            )
          : [];

        const sums = {};
        const counts = {};
        const timeFields = {}; // mark fields that are time-like

        const parseTimeToSeconds = (s) => {
          if (s === null || s === undefined) return null;
          const str = String(s).trim();
          // Match H:MM:SS or MM:SS
          const parts = str.split(":").map((p) => p.trim());
          if (
            parts.length === 2 &&
            parts[0].match(/^\d+$/) &&
            parts[1].match(/^\d{2}$/)
          ) {
            const mins = Number(parts[0]);
            const secs = Number(parts[1]);
            if (isNaN(mins) || isNaN(secs)) return null;
            return mins * 60 + secs;
          }
          if (parts.length === 3 && parts.every((p) => p.match(/^\d{1,2}$/))) {
            const hrs = Number(parts[0]);
            const mins = Number(parts[1]);
            const secs = Number(parts[2]);
            if (isNaN(hrs) || isNaN(mins) || isNaN(secs)) return null;
            return hrs * 3600 + mins * 60 + secs;
          }
          return null;
        };

        const formatSecondsToTime = (secs) => {
          if (secs === null || secs === undefined || isNaN(secs)) return null;
          const total = Math.round(secs);
          const hrs = Math.floor(total / 3600);
          const mins = Math.floor((total % 3600) / 60);
          const s = total % 60;
          const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
          if (hrs > 0) return `${hrs}:${pad(mins)}:${pad(s)}`;
          return `${mins}:${pad(s)}`;
        };

        for (const g of gamesWithStats) {
          for (const [k, v] of Object.entries(g.stats || {})) {
            // Try numeric first
            const num = Number(
              typeof v === "object" && v !== null && v.value !== undefined
                ? v.value
                : v,
            );
            if (!isNaN(num)) {
              sums[k] = (sums[k] || 0) + num;
              counts[k] = (counts[k] || 0) + 1;
              continue;
            }

            // Try time parsing (e.g., "12:34" or "1:12:34")
            const secs = parseTimeToSeconds(v);
            if (secs !== null) {
              timeFields[k] = true;
              sums[k] = (sums[k] || 0) + secs;
              counts[k] = (counts[k] || 0) + 1;
            }
          }
        }

        const avg = {};
        for (const k of Object.keys(sums)) {
          const c = counts[k] || 1;
          if (timeFields[k]) {
            const avgSecs = sums[k] / c;
            avg[k] = formatSecondsToTime(avgSecs);
          } else {
            avg[k] = Number((sums[k] / c).toFixed(1));
          }
        }
        computedSeasonAverages = Object.keys(avg).length > 0 ? avg : null;
      } catch (e) {
        console.warn(
          `[Athlete:${sportKey}] failed to compute NHL season averages:`,
          e?.message || e,
        );
        computedSeasonAverages = null;
      }
    }
    // Prepare last10matches (most recent 10 with stats)
    let last10matches = recentGames.slice(0, 10);

    // Determine today's opponent via scoreboard when possible (more reliable)
    let opponentId = found.opponentId || null;
    let opponentAbbreviation = null;
    let opponentDisplayName = null;
    // Debug flag: whether scoreboard lookup successfully located the opponent
    let opponentFoundFromScoreboard = false;
    try {
      const sb = await fetchScoreboard(sportKey);
      if (sb && sb.events) {
        for (const ev of sb.events) {
          const comps = ev.competitions?.[0]?.competitors || [];
          const match = comps.find(
            (c) => String(c.team?.id) === String(team?.id),
          );
          if (match) {
            const other = comps.find(
              (c) => String(c.team?.id) !== String(team?.id),
            );
            if (other && other.team && other.team.id) {
              opponentId = other.team.id;
              opponentAbbreviation = other.team.abbreviation || null;
              opponentDisplayName = other.team.displayName || null;
              opponentFoundFromScoreboard = true;
              break;
            }
          }
        }
      }
    } catch (e) {
      console.warn(
        `[Athlete:${sportKey}] scoreboard lookup failed:`,
        e?.message || e,
      );
    }

    // If scoreboard provided an opponent but our parsed gamelog didn't produce
    // any h2h matches, attempt to find top-level events that reference that
    // opponent abbreviation and attach seasonTypes stats for those events so
    // they can be included in h2h calculations.
    try {
      const oppAbb = opponentAbbreviation
        ? String(opponentAbbreviation).toUpperCase()
        : null;
      if (oppAbb && Array.isArray(allGames) && allGames.length > 0) {
        const eventsObj = gamelog?.events || [];
        const eventsArr = Array.isArray(eventsObj)
          ? eventsObj.slice()
          : Object.values(eventsObj || {});
        const candidates = eventsArr.filter((ev) => {
          try {
            return (
              String(ev.opponent?.abbreviation || "").toUpperCase() ===
                oppAbb ||
              String(ev.team?.abbreviation || "").toUpperCase() === oppAbb
            );
          } catch (e) {
            return false;
          }
        });
        if (candidates.length > 0) {
          // helper: try to extract stats for an eventId from gamelog.seasonTypes
          const extractStatsForEvent = (eventId) => {
            try {
              const stypes = gamelog?.seasonTypes || [];
              for (const st of stypes) {
                const cats = st.categories || [];
                for (const c of cats) {
                  const evs = c.events || [];
                  for (const ed of evs) {
                    const cands = [ed];
                    if (ed && typeof ed === "object" && ed.event)
                      cands.push(ed.event);
                    for (const cand of cands) {
                      if (!cand || typeof cand !== "object") continue;
                      const possibleIds = [
                        cand.eventId,
                        cand.eventID,
                        cand.event_id,
                        cand.id,
                        cand.gameId,
                        cand.gameID,
                        cand.game_id,
                      ]
                        .filter((v) => v !== undefined && v !== null)
                        .map((v) => String(v));
                      if (possibleIds.includes(String(eventId))) {
                        const stats = cand.stats || ed.stats || [];
                        const formatted = {};
                        const labels = gamelog.labels || [];
                        const names = gamelog.names || [];
                        const displayNames = gamelog.displayNames || [];
                        for (let i = 0; i < stats.length; i++) {
                          const key =
                            (displayNames && displayNames[i]) ||
                            (names && names[i]) ||
                            (labels && labels[i]) ||
                            String(i);
                          if (stats[i] !== undefined) formatted[key] = stats[i];
                        }
                        if (Object.keys(formatted).length > 0) return formatted;
                      }
                    }
                  }
                }
              }
            } catch (e) {}
            return null;
          };

          let attachedAny = false;
          for (const ev of candidates) {
            try {
              const eid = String(ev.id);
              const existing = allGames.find((g) => String(g.id) === eid);
              if (
                existing &&
                existing.stats &&
                Object.keys(existing.stats || {}).length > 0
              )
                continue;
              const stats = extractStatsForEvent(eid);
              if (stats) {
                // update allGames entry
                allGames = allGames.map((g) =>
                  String(g.id) === eid ? Object.assign({}, g, { stats }) : g,
                );
                attachedAny = true;
                if (gamelogDebug)
                  gamelogDebug.resolvedByAbbrev =
                    gamelogDebug.resolvedByAbbrev || {};
                gamelogDebug.resolvedByAbbrev[eid] = { abbrev: oppAbb };
              }
            } catch (e) {}
          }
          if (attachedAny) {
            // rebuild recentGames and last10matches from updated allGames
            const recentWithStats = allGames
              .filter(
                (eg) =>
                  eg && eg.stats && Object.keys(eg.stats || {}).length > 0,
              )
              .sort((a, b) => new Date(b.gameDate) - new Date(a.gameDate));
            recentGames = recentWithStats.slice(0, 20);
            last10matches = recentGames.slice(0, 10);
          }
        }
      }
    } catch (e) {
      /* ignore augmentation errors */
    }

    // Helper: robust opponent matching across possible identifier shapes
    const normalizeForMatch = (s) => (s ? String(s).toLowerCase().trim() : "");
    const oppIdNorm = normalizeForMatch(opponentId);
    const oppAbbrevNorm = normalizeForMatch(opponentAbbreviation);
    const oppDispNorm = normalizeForMatch(opponentDisplayName);

    const matchesOpponent = (g) => {
      if (!g || !g.opponent) return false;
      const oid = normalizeForMatch(g.opponent.id);
      const oabbr = normalizeForMatch(g.opponent.abbreviation);
      const odisp = normalizeForMatch(g.opponent.displayName);
      if (oppIdNorm && oid && oid === oppIdNorm) return true;
      if (oppAbbrevNorm && oabbr && oabbr === oppAbbrevNorm) return true;
      if (oppDispNorm && odisp && odisp === oppDispNorm) return true;
      // fallback: check substring containment for display names
      if (
        oppDispNorm &&
        odisp &&
        (odisp.includes(oppDispNorm) || oppDispNorm.includes(odisp))
      )
        return true;
      return false;
    };

    // Derive head-to-head games from the season-level `allGames` listing so
    // events discovered via gamelog/seasonTypes (and attached to `allGames`)
    // are included in h2h calculations even when they're not present in the
    // `last10matches` view. Limit to the N most recent opponent games to avoid
    // unbounded arrays.
    const opponentGamesAll = Array.isArray(allGames)
      ? allGames
          .filter((g) => matchesOpponent(g))
          .sort((a, b) => new Date(b.gameDate) - new Date(a.gameDate))
      : [];
    // Use up to 20 most recent opponent games for per-line h2h calculations.
    let h2hMatches = opponentId ? opponentGamesAll.slice(0, 20) : [];

    // Fallback: only try to infer the opponent from the most recent game when
    // we were unable to determine an opponent from roster/scoreboard lookup.
    // Do NOT run this when `opponentId` was found (prevents overriding a
    // valid scoreboard-derived opponent and producing incorrect h2h results).
    if (
      (!h2hMatches || h2hMatches.length === 0) &&
      !oppIdNorm &&
      last10matches.length > 0
    ) {
      try {
        const recentOpp = last10matches[0].opponent || null;
        if (recentOpp) {
          const recentOppId = normalizeForMatch(recentOpp.id);
          const recentOppAbb = normalizeForMatch(recentOpp.abbreviation);
          const recentOppDisp = normalizeForMatch(recentOpp.displayName);
          h2hMatches = last10matches.filter((g) => {
            if (!g || !g.opponent) return false;
            const oid = normalizeForMatch(g.opponent.id);
            const oabbr = normalizeForMatch(g.opponent.abbreviation);
            const odisp = normalizeForMatch(g.opponent.displayName);
            if (recentOppId && oid && oid === recentOppId) return true;
            if (recentOppAbb && oabbr && oabbr === recentOppAbb) return true;
            if (recentOppDisp && odisp && odisp === recentOppDisp) return true;
            if (
              recentOppDisp &&
              odisp &&
              (odisp.includes(recentOppDisp) || recentOppDisp.includes(odisp))
            )
              return true;
            return false;
          });
        }
      } catch (e) {
        /* ignore fallback errors */
      }
    }

    // For each odd market, compute l5, l10, h2h occurrences for each variant and altLines
    // Helper to resolve stat values, handling composite '+' statIDs by summing parts
    const resolveStatValue = (statsMap, statID) => {
      const debugEnabledLocal = process.env.DEBUG_SGO_MATCH === "1";
      // Special-case: three-pointers often stored as "3PT" or
      // "3-Point Field Goals Made-Attempted" strings/objects like "1-6".
      // Prefer extracting the left-side (made) number when statID refers to 3PM.
      try {
        if (
          statsMap &&
          statID &&
          /three|threePointersMade|threePointers|3pt/i.test(statID)
        ) {
          for (const key of Object.keys(statsMap || {})) {
            if (!key) continue;
            if (
              /\b3\s*-?\s?pt\b|3pt|3\s*-?\s?point|3-Point|3 Point|3PT/i.test(
                key,
              )
            ) {
              const raw = statsMap[key];
              // String like "1-6"
              if (typeof raw === "string") {
                const m = String(raw).match(/^\s*([0-9]+)\s*[-\/–—]/);
                if (m && m[1]) {
                  return parseInt(m[1], 10) || 0;
                }
                const num = Number(raw);
                if (!isNaN(num)) return num;
              }
              if (typeof raw === "object" && raw !== null) {
                const cand =
                  raw.displayValue ||
                  raw.value ||
                  raw.count ||
                  raw.total ||
                  null;
                if (typeof cand === "string") {
                  const m2 = String(cand).match(/^\s*([0-9]+)\s*[-\/–—]/);
                  if (m2 && m2[1]) {
                    return parseInt(m2[1], 10) || 0;
                  }
                  const num2 = Number(cand);
                  if (!isNaN(num2)) return num2;
                }
                if (raw.value !== undefined) {
                  const nv = Number(raw.value);
                  if (!isNaN(nv)) return nv;
                }
              }
            }
          }
        }
      } catch (e) {
        /* ignore and fallthrough to generic handling */
      }
      if (!statsMap || !statID) {
        if (debugEnabledLocal)
          console.debug(`[resolveStatValue] no statsMap or statID=${statID}`);
        return null;
      }
      if (statID.includes("+")) {
        const parts = statID.split("+").map((p) => p.trim());
        let sum = 0;
        let foundAny = false;
        if (debugEnabledLocal)
          console.debug(
            `[resolveStatValue] composite statID=${statID} parts=${parts.join(
              ",",
            )}`,
          );
        for (const part of parts) {
          // try variants
          const candidates = [
            part,
            part.replace(/_/g, " "),
            part.replace(/_/g, ""),
            `${part}_yards`,
            `${part.replace(/_/g, "")}yards`,
          ];
          let partVal = null;
          if (debugEnabledLocal)
            console.debug(
              `[resolveStatValue] trying part=${part} candidates=${candidates.join(
                ",",
              )}`,
            );
          for (const c of candidates) {
            const v = computeStatValueForGame(
              statsMap,
              Object.keys(statsMap || {}),
              c,
              sportKey,
            );
            if (v !== null && !isNaN(v)) {
              partVal = Number(v);
              if (debugEnabledLocal)
                console.debug(
                  `[resolveStatValue] part match part=${part} candidate=${c} val=${partVal}`,
                );
              break;
            }
          }
          if (partVal !== null) {
            sum += partVal;
            foundAny = true;
          } else if (debugEnabledLocal) {
            console.debug(
              `[resolveStatValue] no match for part=${part} statID=${statID}`,
            );
          }
        }
        return foundAny ? sum : null;
      }
      const v = computeStatValueForGame(
        statsMap,
        Object.keys(statsMap || {}),
        statID,
        sportKey,
      );
      if (debugEnabledLocal)
        console.debug(`[resolveStatValue] statID=${statID} resolved=${v}`);
      return v;
    };

    const annotateOdds = (markets) => {
      if (!Array.isArray(markets)) return [];
      // Filter out NFL player-only markets that are tied to a specific period
      const filteredMarkets = (markets || []).filter((m) => {
        try {
          if (sportKey === "nfl" && !m.statEntityID) {
            const variants = m.variants || [];
            // If any variant is period-specific (either on the variant itself
            // or inside its byBookmaker entries), skip the whole market
            const hasPeriodSpecific = variants.some((v) => {
              if (v && v.periodID && v.periodID !== "game") return true;
              const bkEntries = Object.values(v.byBookmaker || {});
              return bkEntries.some(
                (bk) => bk && bk.periodID && bk.periodID !== "game",
              );
            });
            if (hasPeriodSpecific) {
              return false;
            }
          }
        } catch (e) {
          return true;
        }
        return true;
      });
      return filteredMarkets.map((m) => {
        const statID = m.statID || null;
        const annotated = Object.assign({}, m);
        annotated.variants = (m.variants || []).map((v) => {
          const annotatedVariant = Object.assign({}, v);
          annotatedVariant.byBookmaker = {};
          for (const [bk, bkData] of Object.entries(v.byBookmaker || {})) {
            const bkEntry = Object.assign({}, bkData);
            // If this variant is tied to a specific period (1q, 1h, etc.) we cannot derive annotatedLines from ESPN gamelog
            // Special-case: for NFL player-only markets (no statEntityID), hide period-based lines
            if (annotatedVariant.periodID || bkEntry.periodID) {
              if (sportKey === "nfl" && !m.statEntityID) {
                // player-only NFL market tied to a period -> don't show annotated lines
                annotatedVariant.byBookmaker[bk] = Object.assign({}, bkEntry, {
                  annotatedLines: [],
                });
                continue;
              }
              // For other markets, also avoid attempting to annotate period-specific markets
              annotatedVariant.byBookmaker[bk] = Object.assign({}, bkEntry, {
                annotatedLines: [],
              });
              continue;
            }

            const linesToCheck = [];
            if (bkEntry.overUnder !== undefined) {
              linesToCheck.push({
                overUnder: bkEntry.overUnder,
                odds: bkEntry.odds,
              });
            }
            if (bkEntry.altLines && Array.isArray(bkEntry.altLines)) {
              for (const alt of bkEntry.altLines) linesToCheck.push(alt);
            }

            // For NHL some markets use 'points' in SGO but ESPN labels Goals/Assists separately.
            // When the marketName explicitly references Goals, prefer 'goals' as the stat to resolve.
            const effectiveStatID =
              sportKey === "nhl" &&
              statID === "points" &&
              (m.marketName || "").toLowerCase().includes("goals over/under")
                ? "goals"
                : statID;

            const annotatedLines = linesToCheck.map((line) => {
              let threshold = parseFloat(line.overUnder);
              if (isNaN(threshold)) threshold = 1; // default for boolean markets
              const side = annotatedVariant.sideID || v.sideID || "over";
              // compute counts
              const gamesForCalc = last10matches;
              const l10 = gamesForCalc.reduce((acc, g) => {
                const val = resolveStatValue(g.stats, effectiveStatID);
                if (val === null || isNaN(val)) return acc;
                if (side === "over") return acc + (val >= threshold ? 1 : 0);
                return acc + (val <= threshold ? 1 : 0);
              }, 0);

              const l5 = gamesForCalc.slice(0, 5).reduce((acc, g) => {
                const val = resolveStatValue(g.stats, effectiveStatID);
                if (val === null || isNaN(val)) return acc;
                if (side === "over") return acc + (val >= threshold ? 1 : 0);
                return acc + (val <= threshold ? 1 : 0);
              }, 0);

              const h2h = h2hMatches.reduce((acc, g) => {
                const val = resolveStatValue(g.stats, effectiveStatID);
                if (val === null || isNaN(val)) return acc;
                if (side === "over") return acc + (val >= threshold ? 1 : 0);
                return acc + (val <= threshold ? 1 : 0);
              }, 0);

              // Season totals across allGames (use allGames from parseGamelog)
              const seasonGames = Array.isArray(allGames)
                ? allGames.filter(
                    (eg) =>
                      eg && eg.stats && Object.keys(eg.stats || {}).length > 0,
                  ).length
                : 0;
              const seasonHits = Array.isArray(allGames)
                ? allGames.reduce((acc, eg) => {
                    if (!eg || !eg.stats) return acc;
                    const val = resolveStatValue(eg.stats, effectiveStatID);
                    if (val === null || isNaN(val)) return acc;
                    if (side === "over")
                      return acc + (val >= threshold ? 1 : 0);
                    return acc + (val <= threshold ? 1 : 0);
                  }, 0)
                : 0;

              const seasonH2HGames = Array.isArray(allGames)
                ? allGames.filter(
                    (eg) => eg && eg.opponent && matchesOpponent(eg),
                  ).length
                : 0;
              const seasonH2HHits = Array.isArray(allGames)
                ? allGames.reduce((acc, eg) => {
                    if (!eg || !eg.opponent || !matchesOpponent(eg)) return acc;
                    if (!eg.stats) return acc;
                    const val = resolveStatValue(eg.stats, statID);
                    if (val === null || isNaN(val)) return acc;
                    if (side === "over")
                      return acc + (val >= threshold ? 1 : 0);
                    return acc + (val <= threshold ? 1 : 0);
                  }, 0)
                : 0;

              const season = `${seasonHits}/${seasonGames}`;
              const h2hSeason = `${seasonH2HHits}/${seasonH2HGames}`;

              return Object.assign({}, line, {
                l5,
                l10,
                h2h,
                season,
                h2hSeason,
              });
            });

            annotatedVariant.byBookmaker[bk] = Object.assign({}, bkEntry, {
              annotatedLines,
            });
          }
          return annotatedVariant;
        });
        return annotated;
      });
    };

    const oddsAnnotated = annotateOdds(oddsMarkets);

    const athleteOut = Object.assign({}, athlete);
    if (athleteOut && athleteOut.odds) delete athleteOut.odds;

    // If we have gamelog debug info and a scoreboard-derived opponent,
    // filter the resolvedByAbbrev listing to only include events where the
    // event.opponent.abbreviation matches the scoreboard opponentAbbreviation.
    // Also attempt to attach the seasonTypes stats for the matched event id.
    if (gamelogDebug && gamelogDebug.resolvedByAbbrev && opponentAbbreviation) {
      try {
        const filtered = {};
        const targetAbb = String(opponentAbbreviation).toUpperCase();
        const stypes = gamelog?.seasonTypes || [];
        const labelsAll = gamelog?.labels || [];
        const namesAll = gamelog?.names || [];
        const displayNamesAll = gamelog?.displayNames || [];

        const extractStatsForEvent = (eventId) => {
          try {
            for (const st of stypes) {
              const cats = st.categories || [];
              for (const c of cats) {
                const evs = c.events || [];
                for (const ed of evs) {
                  const cands = [ed];
                  if (ed && typeof ed === "object" && ed.event)
                    cands.push(ed.event);
                  for (const cand of cands) {
                    if (!cand || typeof cand !== "object") continue;
                    const possibleIds = [
                      cand.eventId,
                      cand.eventID,
                      cand.event_id,
                      cand.id,
                      cand.gameId,
                      cand.gameID,
                      cand.game_id,
                    ]
                      .filter((v) => v !== undefined && v !== null)
                      .map((v) => String(v));
                    if (possibleIds.includes(String(eventId))) {
                      const stats = cand.stats || ed.stats || [];
                      const formatted = {};
                      for (let i = 0; i < stats.length; i++) {
                        const key =
                          (displayNamesAll && displayNamesAll[i]) ||
                          (namesAll && namesAll[i]) ||
                          (labelsAll && labelsAll[i]) ||
                          String(i);
                        if (stats[i] !== undefined) formatted[key] = stats[i];
                      }
                      return Object.keys(formatted).length > 0
                        ? formatted
                        : null;
                    }
                  }
                }
              }
            }
          } catch (e) {
            return null;
          }
          return null;
        };

        for (const [evtId, evtObj] of Object.entries(
          gamelogDebug.resolvedByAbbrev || {},
        )) {
          try {
            const evOppAbb = String(
              evtObj?.opponent?.abbreviation || "",
            ).toUpperCase();
            if (evOppAbb === targetAbb) {
              // attach stats from seasonTypes if available
              const stats = extractStatsForEvent(evtId);
              filtered[evtId] = { id: evtObj.id, opponent: evtObj.opponent };
              if (stats) filtered[evtId].stats = stats;
            }
          } catch (e) {
            /* ignore per-entry errors */
          }
        }
        gamelogDebug.resolvedByAbbrev = filtered;
      } catch (e) {
        /* ignore debug augmentation errors */
      }
    }

    // Style h2h entries like `last10matches` objects. Keep the most useful
    // fields (id, links, atVs, gameDate, score, opponent, stats, etc.). Use
    // available fields from the season `allGames` entries and provide safe
    // defaults when a field is missing.
    const h2hStyled = (h2hMatches || []).map((g) => {
      const gid = g?.id || g?.gameId || g?.eventId || null;
      const gameDate = g?.gameDate || g?.date || null;
      const gameResult = g?.gameResult || g?.result || null;
      // Determine atVs similar to last10matches: if homeTeamId equals our team id, it's 'vs', otherwise '@'
      const homeTeamId = g?.homeTeamId || g?.home?.id || null;
      const atVs =
        g?.atVs ||
        (homeTeamId
          ? String(homeTeamId) === String(team?.id)
            ? "vs"
            : "@"
          : null);
      const score = g?.score || null;
      const oppSrc = g?.opponent || {};
      const opponent = oppSrc
        ? {
            id: oppSrc.id || oppSrc.teamId || null,
            displayName: oppSrc.displayName || oppSrc.name || null,
            abbreviation: oppSrc.abbreviation || oppSrc.abbrev || null,
          }
        : null;

      return {
        id: gid,
        atVs,
        gameDate,
        score,
        gameResult,
        opponent,
        stats: g?.stats || null,
      };
    });

    // Find gameId from scoreboard for today's game
    let gameId = null;
    try {
      // Fetch fresh scoreboard data for this sport if not already loaded
      let sbData =
        (scoreboardDataBySport && scoreboardDataBySport[sportKey]) ||
        scoreboardData;
      if (!sbData || !sbData.events || sbData.events.length === 0) {
        sbData = await fetchScoreboard(sportKey);
      }

      if (sbData && sbData.events && team && team.id) {
        const todaysGame = sbData.events.find((evt) => {
          const comps = evt.competitions || [];
          for (const comp of comps) {
            const competitors = comp.competitors || [];
            const hasTeam = competitors.some(
              (c) => String(c.team?.id) === String(team.id),
            );
            if (hasTeam) return true;
          }
          return false;
        });
        if (todaysGame) gameId = todaysGame.id;
      }
    } catch (e) {
      console.warn(
        `[Athlete:${sportKey}] Failed to fetch gameId:`,
        e?.message || e,
      );
    }

    const out = {
      athlete: athleteOut,
      team,
      gameId,
      odds: oddsAnnotated,
      last10matches,
      h2h: h2hStyled,
      seasonAverages: computedSeasonAverages,
    };
    return res.json(out);
  } catch (e) {
    console.error("/api/athlete error", e?.message || e);
    return res.status(500).json({ error: "internal error" });
  }
});

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
      `[route-alias-forward] forwarding POST /api/betslip -> ${base}/api/betslips`,
    );
    const resp = await axios.post(
      `${base.replace(/\/$/, "")}/api/betslips`,
      req.body,
      {
        headers: { ...(req.headers || {}), host: undefined },
        timeout: 15000,
      },
    );
    return res.status(resp.status).json(resp.data);
  } catch (e) {
    console.error(
      "[route-alias-forward] POST /api/betslip forward failed",
      e?.message || e,
    );
    if (e.response) return res.status(e.response.status).send(e.response.data);
    return res.status(500).json({ error: "forward failed" });
  }
});

// POST /api/invite -> accept invite requests for Google Play closed testing
app.post("/api/invite", async (req, res) => {
  try {
    const email = (req.body && req.body.email) || req.query.email;
    if (!email) return res.status(400).json({ error: "Missing email" });

    // Persist invite to a newline-delimited JSON file in this folder
    const fs = require("fs");
    const path = require("path");
    const outFile = path.join(__dirname, "invites.ndjson");
    const record = {
      email: String(email).toLowerCase(),
      ts: new Date().toISOString(),
    };
    try {
      fs.appendFileSync(outFile, JSON.stringify(record) + "\n");
    } catch (err) {
      console.error("Failed to write invite file", err);
    }

    // Send Expo push notification to explicit token
    try {
      const pushToken = "ExponentPushToken[n89v9RMxcOOeFCEp-inWiL]";
      if (Expo.isExpoPushToken(pushToken)) {
        const messages = [
          {
            to: pushToken,
            sound: "default",
            title: "New Google Play Request",
            body: `${email} is requesting access to closed testing`,
            data: { email },
            priority: "high",
          },
        ];

        const chunks = expo.chunkPushNotifications(messages);
        for (const chunk of chunks) {
          try {
            const tickets = await expo.sendPushNotificationsAsync(chunk);
            tickets.forEach((t) => {
              if (t.status === "error")
                console.error("Expo ticket error", t.message, t.details);
            });
          } catch (e) {
            console.error("Expo send error", e);
          }
        }
      } else {
        console.warn("Configured push token is not a valid Expo token");
      }
    } catch (pushErr) {
      console.error("Failed to send push notification", pushErr);
    }

    return res.json({ status: "ok" });
  } catch (err) {
    console.error("/api/invite error", err);
    return res.status(500).json({ error: "internal error" });
  }
});

// GET /api/invite -> return persisted invites as JSON map { email: timestamp }
app.get("/api/invite", async (req, res) => {
  try {
    const fs = require("fs");
    const path = require("path");
    const inFile = path.join(__dirname, "invites.ndjson");
    if (!fs.existsSync(inFile)) return res.json({});
    const content = fs.readFileSync(inFile, "utf8");
    const lines = content.split(/\r?\n/).filter(Boolean);
    const out = {};
    for (const line of lines) {
      try {
        const rec = JSON.parse(line);
        if (rec && rec.email)
          out[String(rec.email).toLowerCase()] = rec.ts || null;
      } catch (e) {
        // ignore malformed lines
      }
    }
    return res.json(out);
  } catch (e) {
    console.error("GET /api/invite error", e);
    return res.status(500).json({ error: "internal error" });
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
        "daily_available_day, daily_claimed, daily_claimed_at, daily_next_available_at",
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
        "credits, is_pro, pro_expires_at, daily_available_day, daily_claimed, daily_next_available_at",
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
      profileRow && isActivePro(profileRow) ? baseReward + 500 : baseReward;

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
          now.getTime() + 24 * 60 * 60 * 1000,
        ).toISOString(),
      })
      .eq("id", userId)
      .select(
        "id, credits, daily_available_day, daily_claimed, daily_claimed_at, daily_next_available_at",
      )
      .maybeSingle();
    if (updateErr) throw updateErr;

    // Log updated profile for diagnostics (helps verify persisted fields)
    console.log("/api/daily/claim: updated profile:", updatedProfile);
    if (!updatedProfile) {
      console.warn(
        "/api/daily/claim: update completed but returned no row (0 rows affected)",
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
        ledgerEx?.message || ledgerEx,
      );
    }

    // Read back the profile to verify persistence and log detailed diagnostics
    let verifyRow = null;
    try {
      const { data, error: verifyErr } = await supabaseAdmin
        .from("profiles")
        .select(
          "id, credits, daily_available_day, daily_claimed, daily_claimed_at, daily_next_available_at, updated_at",
        )
        .eq("id", userId)
        .maybeSingle();
      if (verifyErr) {
        console.warn("/api/daily/claim: verify read failed", verifyErr);
      } else {
        verifyRow = data;
        console.log(
          "/api/daily/claim: verify profile after update:",
          verifyRow,
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
            { daily_claimed: verifyRow.daily_claimed },
          );
        }
      }
    } catch (verifyEx) {
      console.warn(
        "/api/daily/claim: verify read exception",
        verifyEx?.message || verifyEx,
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
      `[route-alias-forward] forwarding POST /api/betslip/${id}/watch -> ${base}/api/betslips/${id}/watch`,
    );
    const resp = await axios.post(
      `${base.replace(/\/$/, "")}/api/betslips/${id}/watch`,
      req.body || {},
      {
        headers: { ...(req.headers || {}), host: undefined },
        timeout: 10000,
      },
    );
    return res.status(resp.status).json(resp.data);
  } catch (e) {
    console.error(
      "[route-alias-forward] POST /api/betslip/:id/watch forward failed",
      e?.message || e,
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
      `[route-alias-forward] forwarding DELETE /api/betslip/${id}/watch -> ${base}/api/betslips/${id}/watch`,
    );
    const resp = await axios.delete(
      `${base.replace(/\/$/, "")}/api/betslips/${id}/watch`,
      {
        headers: { ...(req.headers || {}), host: undefined },
        timeout: 10000,
      },
    );
    return res.status(resp.status).json(resp.data);
  } catch (e) {
    console.error(
      "[route-alias-forward] DELETE /api/betslip/:id/watch forward failed",
      e?.message || e,
    );
    if (e.response) return res.status(e.response.status).send(e.response.data);
    return res.status(500).json({ error: "forward failed" });
  }
});

// Data cache
// Keep a per-sport scoreboard cache to avoid cross-sport lookups
let scoreboardDataBySport = {};
let scoreboardData = null;
let summaryDataCache = {}; // { eventId: data }
let rosterGamelogCache = {}; // { teamId: { roster, gamelogs } }
// Simple in-memory admin error store (CRUD via /api/error)
let adminErrors = [];
let adminErrorNextId = 1;

// Configuration
const ESPN_BASE_URL =
  "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
const ESPN_WEB_API_URL =
  "https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba";

// Mapping of supported sports to ESPN API base paths
const ESPN_PATHS = {
  nba: {
    base: "https://site.api.espn.com/apis/site/v2/sports/basketball/nba",
    web: "https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba",
  },
  nhl: {
    base: "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl",
    web: "https://site.web.api.espn.com/apis/common/v3/sports/hockey/nhl",
  },
  nfl: {
    base: "https://site.api.espn.com/apis/site/v2/sports/football/nfl",
    web: "https://site.web.api.espn.com/apis/common/v3/sports/football/nfl",
  },
  uefa: {
    base: "https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions",
    web: "https://site.web.api.espn.com/apis/common/v3/sports/soccer/uefa.champions",
  },
};
// SportGameOdds API configuration
const SPORTSGAMEODDS_API_BASE = "https://api.sportsgameodds.com/v2/events";
const SPORTSGAMEODDS_API_KEY =
  process.env.SPORTSGAMEODDS_API_KEY || "09a4de43e78a93453e9143b1d4e501f0";

// Mapping sport slug -> leagueID for SportGameOdds
const SGO_LEAGUE_IDS = {
  nba: "NBA",
  nhl: "NHL",
  nfl: "NFL",
  uefa: "UEFA_CHAMPIONS_LEAGUE",
};

// Odds cache (refreshed every 12 hours)
let oddsCache = {}; // { [sport]: { lastFetched: Date, data: [...] } }
const SGO_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
let rosterCache = {}; // { [sport]: { lastFetched: number, data: {...}, isFetching: bool } }

function getLosAngelesDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const map = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
  };
}

function formatDateOnlyUTC(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Helper: compute startsAfter / startsBefore for SportGameOdds based on PST day
function getSGODayRangePST() {
  const la = getLosAngelesDateParts();
  // Use previous LA day if before 2am in Los Angeles
  const anchor = new Date(Date.UTC(la.year, la.month - 1, la.day));
  if (la.hour < 2) {
    anchor.setUTCDate(anchor.getUTCDate() - 1);
  }

  const next = new Date(anchor);
  next.setUTCDate(next.getUTCDate() + 1);

  const startDate = formatDateOnlyUTC(anchor);
  const endDate = formatDateOnlyUTC(next);

  // Keep 10:00Z boundaries to preserve existing API window behavior.
  const startsAfter = `${startDate}T10:00:00Z`;
  const startsBefore = `${endDate}T10:00:00Z`;

  return { startsAfter, startsBefore };
}

// Transform SportGameOdds event data into simplified shape per requirements
function transformSGOEvent(event, sportKey = "nba") {
  const teams = {
    home: {
      name: event.teams?.home?.names?.long || null,
      abbr: event.teams?.home?.names?.short || null,
      id: event.teams?.home?.teamID || null,
    },
    away: {
      name: event.teams?.away?.names?.long || null,
      abbr: event.teams?.away?.names?.short || null,
      id: event.teams?.away?.teamID || null,
    },
  };

  const playersMap = {}; // playerId -> marketName -> grouped
  const teamMap = { home: new Map(), away: new Map() }; // marketName -> grouped
  const allMap = new Map();

  const oddsObj = event.odds || {};
  const markets = Object.values(oddsObj || {});

  for (const m of markets) {
    const byBookmaker = m.byBookmaker || {};
    // prune bookmakers: remove top-level lastUpdatedAt and deeplink; keep other fields
    const prunedByBookmaker = {};
    for (const [bk, val] of Object.entries(byBookmaker)) {
      if (!val || (typeof val === "object" && Object.keys(val).length === 0))
        continue;
      const copy = { ...(val || {}) };
      delete copy.lastUpdatedAt;
      delete copy.deeplink;

      // handle altLines: include but remove lastUpdatedAt and available
      if (Array.isArray(copy.altLines) && copy.altLines.length) {
        copy.altLines = copy.altLines
          .map((al) => {
            if (!al || typeof al !== "object") return null;
            const a = { ...(al || {}) };
            delete a.lastUpdatedAt;
            delete a.available;
            return a;
          })
          .filter(Boolean);
        if (copy.altLines.length === 0) delete copy.altLines;
      }

      // if copy ended up empty after deletion, skip
      if (Object.keys(copy).length === 0) continue;
      prunedByBookmaker[bk] = copy;
    }

    // if no bookmakers after pruning, skip this market
    if (Object.keys(prunedByBookmaker).length === 0) continue;

    const marketName = m.marketName || null;
    const statID = m.statID || m.statId || null;
    const statEntityID = m.statEntityID || null;

    const variant = {
      sideID: m.sideID || null,
      byBookmaker: prunedByBookmaker,
    };
    if (m.periodID && m.periodID !== "game") variant.periodID = m.periodID;

    // classify and group
    if (m.playerID) {
      const pid = String(m.playerID);
      if (!playersMap[pid]) playersMap[pid] = new Map();
      const key = marketName || statID || "";
      if (!playersMap[pid].has(key)) {
        playersMap[pid].set(key, { marketName, statID, variants: [] });
      }
      playersMap[pid].get(key).variants.push(variant);
    } else if (
      typeof statEntityID === "string" &&
      statEntityID.toLowerCase().includes("home")
    ) {
      const key = marketName || statID || "";
      if (!teamMap.home.has(key)) {
        teamMap.home.set(key, {
          marketName,
          statID,
          statEntityID,
          variants: [],
        });
      }
      teamMap.home.get(key).variants.push(variant);
    } else if (
      typeof statEntityID === "string" &&
      statEntityID.toLowerCase().includes("away")
    ) {
      const key = marketName || statID || "";
      if (!teamMap.away.has(key)) {
        teamMap.away.set(key, {
          marketName,
          statID,
          statEntityID,
          variants: [],
        });
      }
      teamMap.away.get(key).variants.push(variant);
    } else {
      const key = marketName || statID || "";
      if (!allMap.has(key)) {
        allMap.set(key, { marketName, statID, statEntityID, variants: [] });
      }
      allMap.get(key).variants.push(variant);
    }
  }

  // Convert maps to arrays and for players convert inner maps to arrays
  const teamOdds = {
    home: Array.from(teamMap.home.values()),
    away: Array.from(teamMap.away.values()),
  };

  const players = {};
  for (const [pid, map] of Object.entries(playersMap)) {
    const arr = [];
    for (const entry of Array.from(map.values())) {
      try {
        const variants = entry.variants || [];
        const hasPeriodSpecific = variants.some((v) => {
          if (v && v.periodID && v.periodID !== "game") return true;
          const bkEntries = Object.values(v.byBookmaker || {});
          return bkEntries.some(
            (bk) => bk && bk.periodID && bk.periodID !== "game",
          );
        });
        // Only skip these player markets for NFL — other sports may legitimately
        // include period-specific player markets that we should preserve.
        if (sportKey === "nfl" && hasPeriodSpecific) continue; // skip player market tied to a specific period for NFL
      } catch (e) {
        // ignore and include entry on error
      }
      arr.push(entry);
    }
    if (arr.length > 0) players[pid] = arr;
  }

  const allOdds = Array.from(allMap.values());

  // build player meta map (id -> display name) to help matching later
  const playerMeta = {};
  if (event.players && typeof event.players === "object") {
    for (const [pid, pdata] of Object.entries(event.players)) {
      playerMeta[pid] =
        pdata?.name || pdata?.displayName || pdata?.fullName || null;
    }
  }

  return {
    id: event.eventID || event.eventId || event.event_id || null,
    date: event.status?.startsAt || event.startsAt || event.date || null,
    teams,
    odds: {
      teams: teamOdds,
      players,
      all: allOdds,
    },
    playerMeta,
  };
}
async function fetchSGOOdds(sport = "nba") {
  const sportKey = String(sport || "nba").toLowerCase();
  // mark fetching to avoid duplicate concurrent fetches
  if (!oddsCache[sportKey])
    oddsCache[sportKey] = { lastFetched: 0, data: null, isFetching: false };
  if (oddsCache[sportKey].isFetching) return null; // another fetch in progress

  oddsCache[sportKey].isFetching = true;
  try {
    const leagueID = SGO_LEAGUE_IDS[sportKey] || SGO_LEAGUE_IDS.nba;
    const { startsAfter, startsBefore } = getSGODayRangePST();
    console.log(
      `[SGO:${sportKey}] query window startsAfter=${startsAfter} startsBefore=${startsBefore}`,
    );

    const url = `${SPORTSGAMEODDS_API_BASE}?leagueID=${encodeURIComponent(
      leagueID,
    )}&startsAfter=${encodeURIComponent(
      startsAfter,
    )}&startsBefore=${encodeURIComponent(
      startsBefore,
    )}&ended=false&live=false&bookmakerID=fanduel,draftkings&includeOpposingOdds=false&expandResults=false&includeAltLines=true&limit=25&apiKey=${SPORTSGAMEODDS_API_KEY}`;

    const resp = await axios.get(url, { timeout: 20000 });
    const events = resp.data?.data || resp.data || [];

    const transformed = Array.isArray(events)
      ? events.map((ev) => transformSGOEvent(ev, sportKey))
      : [];

    oddsCache[sportKey] = {
      lastFetched: Date.now(),
      data: transformed,
      isFetching: false,
    };
    console.log(`[SGO:${sportKey}] fetched ${transformed.length} events`);
    return transformed;
  } catch (err) {
    oddsCache[sportKey].isFetching = false;
    return null;
  }
}

// Find player odds from in-memory SGO cache by matching player name heuristically
function getPlayerOddsFromCache(sportKey, athlete) {
  try {
    if (!oddsCache[sportKey] || !oddsCache[sportKey].data) {
      return null;
    }

    const events = oddsCache[sportKey].data || [];

    // Helper: normalize names (remove diacritics, punctuation, collapse spaces)
    const normalize = (s) => {
      if (!s) return "";
      try {
        return String(s)
          .normalize("NFD")
          .replace(/\p{Diacritic}/gu, "")
          .replace(/[^a-zA-Z0-9\s]/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();
      } catch (e) {
        return String(s).toLowerCase();
      }
    };

    const first = athlete.firstName || null;
    const last = athlete.lastName || null;
    const short = athlete.shortName || null;
    const display = athlete.displayName || athlete.name || null;
    const normalizedFull = normalize(`${first || ""} ${last || ""}`.trim());

    // First try: exact full-name match against SGO player names (highest confidence)
    if (normalizedFull) {
      for (const ev of events) {
        const playerMeta = ev.playerMeta || {};
        const playerOdds = ev.odds?.players || {};
        for (const [pid, markets] of Object.entries(playerOdds || {})) {
          const pnameRaw = playerMeta[pid] || pid || "";
          const pname = normalize(pnameRaw);
          if (!pname) continue;
          if (pname === normalizedFull) {
            // Filter out passing_longestCompletion markets
            const filteredMarkets = Array.isArray(markets)
              ? markets.filter(
                  (m) => m && m.statID !== "passing_longestCompletion",
                )
              : markets;
            return filteredMarkets;
          }
        }
      }
    }
    // Strict exact matching only: compare normalized player names from SGO
    // against athlete normalized full name and display name. This avoids
    // fuzzy collisions (e.g., shared last names) that produced incorrect
    // assignments.
    const normalizedDisplay = display ? normalize(display) : null;
    for (const ev of events) {
      const playerMeta = ev.playerMeta || {};
      const playerOdds = ev.odds?.players || {};
      for (const [pid, markets] of Object.entries(playerOdds || {})) {
        const pnameRaw = playerMeta[pid] || pid || "";
        const pname = normalize(pnameRaw);
        if (!pname) continue;
        if (normalizedFull && pname === normalizedFull) {
          // Filter out passing_longestCompletion markets
          const filteredMarkets = Array.isArray(markets)
            ? markets.filter(
                (m) => m && m.statID !== "passing_longestCompletion",
              )
            : markets;
          return filteredMarkets;
        }
        if (normalizedDisplay && pname === normalizedDisplay) {
          // Filter out passing_longestCompletion markets
          const filteredMarkets = Array.isArray(markets)
            ? markets.filter(
                (m) => m && m.statID !== "passing_longestCompletion",
              )
            : markets;
          return filteredMarkets;
        }
      }
    }

    return null;
  } catch (e) {
    return null;
  }
}

// Fetch rosters for a sport (team roster pages only, no gamelogs). Populate rosterCache.
async function fetchRostersForSport(sport = "nba") {
  const sportKey = String(sport || "nba").toLowerCase();
  if (!rosterCache[sportKey])
    rosterCache[sportKey] = { lastFetched: 0, data: null, isFetching: false };
  // Short startup delay to give a background SGO fetch time to prime (reduce races)
  await new Promise((r) => setTimeout(r, 2500));
  if (rosterCache[sportKey].isFetching) return null;
  rosterCache[sportKey].isFetching = true;
  try {
    // Ensure scoreboard exists for the sport so we can discover teams
    const sb = await fetchScoreboard(sportKey);
    if (!sb || !sb.events) {
      rosterCache[sportKey].isFetching = false;
      return null;
    }

    const teamIds = new Set();
    const opponentMap = {};
    sb.events.forEach((event) => {
      const comps = event.competitions || [];
      const competitors = comps[0]?.competitors || [];
      competitors.forEach((c) => {
        if (c.team?.id) teamIds.add(c.team.id);
      });
      if (competitors.length === 2) {
        const t1 = competitors[0].team.id;
        const t2 = competitors[1].team.id;
        opponentMap[t1] = t2;
        opponentMap[t2] = t1;
      }
    });

    const teamsData = [];
    const esBase =
      (ESPN_PATHS[sportKey] && ESPN_PATHS[sportKey].base) ||
      ESPN_PATHS.nba.base;

    for (const teamId of Array.from(teamIds)) {
      try {
        const resp = await axios.get(`${esBase}/teams/${teamId}/roster`, {
          timeout: 15000,
        });
        const roster = resp.data || {};

        // If odds cache for this sport is empty, try to fetch SGO odds first
        if (
          (!oddsCache[sportKey] || !oddsCache[sportKey].data) &&
          !oddsCache[sportKey]?.isFetching
        ) {
          try {
            await fetchSGOOdds(sportKey);
          } catch (e) {
            console.warn(
              `[Rosters:${sportKey}] attempted to prime SGO cache but failed:`,
              e?.message || e,
            );
          }
        }

        // Support multiple roster shapes returned by ESPN APIs
        const athletesRaw =
          roster.athletes ||
          roster.items ||
          roster.roster?.athletes ||
          roster.players ||
          [];

        // Normalize shapes where ESPN groups athletes by position (e.g. NHL/NFL):
        // [{ position: 'center', items: [ ...players ] }, ...]
        let athletesList = [];
        if (
          Array.isArray(athletesRaw) &&
          athletesRaw.length > 0 &&
          Array.isArray(athletesRaw[0].items)
        ) {
          athletesList = athletesRaw.flatMap((g) => g.items || []);
        } else if (Array.isArray(athletesRaw)) {
          athletesList = athletesRaw;
        }

        const processedAthletes = (athletesList || [])
          .filter((a) => !a.injuries || a.injuries.length === 0)
          .map((ath) => {
            // Robust id extraction
            const id =
              ath.id ||
              ath.player?.id ||
              ath.athlete?.id ||
              ath.person?.id ||
              null;

            // Robust name extraction
            const displayName =
              ath.displayName ||
              ath.fullName ||
              ath.player?.fullName ||
              ath.athlete?.displayName ||
              ath.name ||
              null;
            const first =
              ath.firstName ||
              ath.player?.firstName ||
              (displayName ? displayName.split(" ")[0] : null);
            const last =
              ath.lastName ||
              ath.player?.lastName ||
              (displayName ? displayName.split(" ").slice(1).join(" ") : null);
            const shortName = ath.shortName || ath.player?.shortName || null;
            const jersey =
              ath.jersey || ath.uniform?.number || ath.player?.jersey || null;
            const position =
              ath.position?.abbreviation ||
              ath.player?.position?.abbreviation ||
              ath.position ||
              null;

            const athleteObj = {
              id: id,
              name:
                displayName || `${first || ""} ${last || ""}`.trim() || null,
              firstName: first || null,
              lastName: last || null,
              jersey: jersey,
            };

            // attach odds from local SGO cache (no network fetch from SGO endpoint)
            const odds = getPlayerOddsFromCache(sportKey, athleteObj) || null;
            if (odds) athleteObj.odds = odds;
            // Only include players for which we could attach odds from the SGO cache
            // (the caller requested roster-only output with odds attached when available).
            return odds ? athleteObj : null;
          })
          .filter(Boolean);

        teamsData.push({
          team: roster.team,
          roster: { athletes: processedAthletes },
          opponentId: opponentMap[teamId] || null,
          lastUpdated: new Date().toISOString(),
        });
      } catch (e) {
        console.warn(
          `[Rosters:${sportKey}] failed to fetch roster for team ${teamId}:`,
          e?.message || e,
        );
      }
    }

    const combined = {
      teams: teamsData,
      lastUpdated: new Date().toISOString(),
    };
    rosterCache[sportKey] = {
      lastFetched: Date.now(),
      data: combined,
      isFetching: false,
    };
    return combined;
  } catch (e) {
    rosterCache[sportKey].isFetching = false;
    console.error(`[Rosters:${sport}] fetch error:`, e?.message || e);
    return null;
  }
}

// Schedule periodic fetching every 2 hours for all supported sports
function scheduleSGOOddsPolling() {
  // Schedule a single daily fetch at 2:00 AM PST that will populate the
  // in-memory `oddsCache` for the whole day. This replaces the previous
  // 2-hour polling behavior.
  cron.schedule(
    "0 2 * * *",
    async () => {
      for (const sport of Object.keys(SGO_LEAGUE_IDS)) {
        try {
          const sgo = await fetchSGOOdds(sport).catch((e) => {
            console.error(
              `[SGO:${sport}] daily fetch failed:`,
              e?.message || e,
            );
            return null;
          });
          if (!sgo)
            console.warn(`[SGO:${sport}] no events fetched on daily run`);

          // Refresh rosters after odds so they can attach odds where available
          await fetchRostersForSport(sport).catch((e) =>
            console.error(
              `[Rosters:${sport}] daily roster fetch failed:`,
              e?.message || e,
            ),
          );
        } catch (e) {
          console.error(
            `[SGO:${sport}] daily sequence error:`,
            e?.message || e,
          );
        }
      }
    },
    {
      timezone: "America/Los_Angeles",
    },
  );

  // NOTE: No periodic setInterval is used — the cache will persist until
  // the next daily run. If an immediate prime is desired on startup,
  // call `fetchSGOOdds` separately during initialization.
}
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
  const la = getLosAngelesDateParts(now);
  return new Date(Date.UTC(la.year, la.month - 1, la.day, la.hour));
}

function getScoreboardDate() {
  const la = getLosAngelesDateParts();
  const anchor = new Date(Date.UTC(la.year, la.month - 1, la.day));

  // If before 2am in Los Angeles, use previous local day
  if (la.hour < 2) {
    anchor.setUTCDate(anchor.getUTCDate() - 1);
  }

  // Format as YYYYMMDD
  const year = anchor.getUTCFullYear();
  const month = String(anchor.getUTCMonth() + 1).padStart(2, "0");
  const day = String(anchor.getUTCDate()).padStart(2, "0");

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
  if (!linescoresArray) return {};

  const linescoresObj = {};
  // If ESPN provides an array of period objects, handle that shape
  if (Array.isArray(linescoresArray)) {
    linescoresArray.forEach((score, index) => {
      const period =
        (score && (score.period || score.periodNumber)) || index + 1;
      const value =
        score && score.displayValue !== undefined ? score.displayValue : score;
      linescoresObj[period] = value;
    });
    return linescoresObj;
  }

  // If ESPN provides an object mapping period -> value (common in some sports), handle that too
  if (typeof linescoresArray === "object") {
    try {
      Object.keys(linescoresArray || {}).forEach((k) => {
        // keep the key as-is (period number or name)
        linescoresObj[k] = linescoresArray[k];
      });
    } catch (e) {
      return {};
    }
    return linescoresObj;
  }
  return {};
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
          record: { summary: competitor.records?.[0]?.summary || null },
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
// Helper function to get team abbreviation from ID in scoreboard data
// Accepts an optional sportKey to consult the sport-specific scoreboard cache.
function getTeamAbbreviationById(teamId, sportKey) {
  const sb = sportKey
    ? (scoreboardDataBySport && scoreboardDataBySport[sportKey]) ||
      scoreboardData
    : scoreboardData;

  if (!sb?.events) return teamId;

  for (const event of sb.events) {
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
    astValues.length,
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
      ).toFixed(1),
    );
    const underConfidence = parseFloat(
      (
        (last5UnderRate * adjustedTier1Weight +
          tier2UnderRate * adjustedTier2Weight +
          seasonUnderRate * seasonWeight) *
        100
      ).toFixed(1),
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

  // Detect NFL from meta or header when possible
  const sportHint = String(
    data.meta?.gp_topic ||
      data.header?.league?.slug ||
      data.header?.league?.abbreviation ||
      "",
  ).toLowerCase();
  const isNFL = /football.*nfl|\bnfl\b|football/i.test(sportHint);
  const isNHL = /hockey|nhl/i.test(sportHint);
  const transformSportKey = isNHL ? "nhl" : isNFL ? "nfl" : null;

  // Precompute 1Q stats and first-made-basket (athlete id + team + scoreValue + period)
  // We do this early so we can attach per-player 1Q stats when building the boxscore.
  const qStats = {}; // { athleteId: { PTS, REB, AST } }
  let firstBasket = null;
  let firstTouchdown = null;
  let lastTouchdown = null;
  let firstGoal = null;
  let lastGoal = null;
  const ppCounts = {}; // NHL power-play points per athleteId
  try {
    if (data.plays && Array.isArray(data.plays) && data.plays.length > 0) {
      // For NBA-style data keep 1Q/firstBasket logic; for NFL we'll compute touchdowns below
      for (const play of data.plays) {
        if (!isNFL && !isNHL) {
          // Determine first made field goal: first scoringPlay with a positive scoreValue
          if (!firstBasket && play && play.scoringPlay && play.scoreValue > 0) {
            const scorerRaw =
              play.participants && play.participants[0]
                ? play.participants[0].athlete?.id ||
                  play.participants[0].athlete?.externalId
                : null;
            if (scorerRaw) {
              const sid = String(scorerRaw);
              firstBasket = {
                athleteId: sid,
                athleteName: null, // filled later after we build athleteNameById
                teamId: play.team?.id || null,
                team: getTeamAbbreviationById(play.team?.id, transformSportKey),
                scoreValue: play.scoreValue,
                period: play.period?.number || null,
              };
            }
          }

          // Only accumulate 1Q stats for period number === 1
          const periodNum = play?.period?.number;
          if (periodNum !== 1) continue;

          // Points (scorer appears as first participant for scoringPlay)
          if (
            play.scoringPlay &&
            play.participants &&
            play.participants.length > 0
          ) {
            const scorerRaw =
              play.participants[0].athlete?.id ||
              play.participants[0].athlete?.externalId;
            if (scorerRaw) {
              const sid = String(scorerRaw);
              qStats[sid] = qStats[sid] || { PTS: 0, REB: 0, AST: 0 };
              const pts =
                typeof play.scoreValue === "number"
                  ? play.scoreValue
                  : Number(play.scoreValue) || 0;
              qStats[sid].PTS += pts;
            }

            // Assist (second participant)
            if (
              play.participants[1] &&
              (play.participants[1].athlete?.id ||
                play.participants[1].athlete?.externalId)
            ) {
              const assistRaw =
                play.participants[1].athlete?.id ||
                play.participants[1].athlete?.externalId;
              const aid = String(assistRaw);
              qStats[aid] = qStats[aid] || { PTS: 0, REB: 0, AST: 0 };
              qStats[aid].AST += 1;
            }
          }

          // Rebounds: shortDescription or type containing 'Rebound', first participant is rebounder
          const shortDesc = String(play.shortDescription || "").toLowerCase();
          const typeText = String(play.type?.text || "").toLowerCase();
          if (shortDesc.includes("rebound") || typeText.includes("rebound")) {
            if (play.participants && play.participants.length > 0) {
              const reboundRaw =
                play.participants[0].athlete?.id ||
                play.participants[0].athlete?.externalId;
              if (reboundRaw) {
                const rid = String(reboundRaw);
                qStats[rid] = qStats[rid] || { PTS: 0, REB: 0, AST: 0 };
                qStats[rid].REB += 1;
              }
            }
          }
        } else if (isNHL) {
          // For NHL, detect first and last goals by play.type.abbreviation === 'goal'
          try {
            const isGoal =
              play &&
              play.type &&
              String(play.type.abbreviation || "").toLowerCase() === "goal";
            if (isGoal) {
              // firstGoal: first goal play encountered
              if (!firstGoal) {
                const scorerRaw =
                  play.participants && play.participants[0]
                    ? play.participants[0].athlete?.id ||
                      play.participants[0].athlete?.externalId
                    : null;
                if (scorerRaw) {
                  firstGoal = {
                    athleteId: String(scorerRaw),
                    athleteName: null,
                    teamId: play.team?.id || null,
                    team: getTeamAbbreviationById(
                      play.team?.id,
                      transformSportKey,
                    ),
                    period: play.period?.number || null,
                    scoreValue: play.scoreValue || null,
                    playIndex: play.sequenceNumber || null,
                  };
                }
              }
              // always update lastGoal to the latest goal encountered
              const scorerRaw2 =
                play.participants && play.participants[0]
                  ? play.participants[0].athlete?.id ||
                    play.participants[0].athlete?.externalId
                  : null;
              if (scorerRaw2) {
                lastGoal = {
                  athleteId: String(scorerRaw2),
                  athleteName: null,
                  teamId: play.team?.id || null,
                  team: getTeamAbbreviationById(
                    play.team?.id,
                    transformSportKey,
                  ),
                  period: play.period?.number || null,
                  scoreValue: play.scoreValue || null,
                  playIndex: play.sequenceNumber || null,
                };
              }
              // Detect power-play scoring plays (type.id === '505' && strength.id === '702')
              try {
                if (
                  String(play.type?.id || "") === "505" &&
                  String(play.strength?.id || "") === "702"
                ) {
                  if (Array.isArray(play.participants)) {
                    for (const p of play.participants) {
                      const pid =
                        p?.athlete?.id || p?.athlete?.externalId || null;
                      if (!pid) continue;
                      const sid = String(pid);
                      ppCounts[sid] = (ppCounts[sid] || 0) + 1;
                    }
                  }
                }
              } catch (e) {
                /* ignore pp counting errors */
              }
            }
          } catch (e) {
            /* ignore per-play errors */
          }
        } // end NHL handling
      }
    }
  } catch (e) {
    // non-fatal
    console.warn(
      "transformSummaryData: failed computing initial 1Q or firstBasket",
      e?.message || e,
    );
  }

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
        // `playerTeam.statistics` can be an array of category objects (passing, rushing, receiving, etc.)
        // Each category has `labels` and `athletes` arrays. We'll aggregate per-athlete across categories.
        const categories = Array.isArray(playerTeam.statistics)
          ? playerTeam.statistics
          : playerTeam.statistics
            ? [playerTeam.statistics]
            : [];

        const athleteMap = {}; // id -> { athlete, active, stats: { category: { label: value } } }

        const normalizeVal = (v) => {
          if (v === null || v === undefined) return v;
          if (typeof v === "number") return v;
          if (typeof v === "string" && /^[-+]?\d+(?:\.\d+)?$/.test(v))
            return Number(v);
          return v;
        };

        for (const cat of categories) {
          const catLabels = cat.labels || [];
          // Attempt to decide a category key name
          const rawCatKey = cat.name || cat.label || cat.displayName || "other";
          const catKey = String(rawCatKey).toLowerCase().replace(/\s+/g, "_");

          const athletesList = cat.athletes || [];
          for (const a of athletesList) {
            const idRaw = a?.athlete?.id || a?.athlete?.externalId || null;
            if (idRaw == null) continue;
            const id = String(idRaw);
            if (!athleteMap[id]) {
              athleteMap[id] = {
                active: a.active || a.active === undefined ? a.active : null,
                starter:
                  a.starter || a.starter === undefined ? a.starter : null,
                athlete: {
                  id: a.athlete?.id || null,
                  displayName:
                    a.athlete?.displayName || a.athlete?.shortName || null,
                  jersey: a.athlete?.jersey || null,
                  position: a.athlete?.position?.abbreviation || null,
                },
                stats: {},
              };
            }

            // Ensure category bucket exists
            athleteMap[id].stats[catKey] = athleteMap[id].stats[catKey] || {};

            // If athlete stats provided as array corresponding to catLabels
            if (Array.isArray(a.stats)) {
              for (let i = 0; i < a.stats.length; i++) {
                const label = catLabels[i] || String(i);
                const val = a.stats[i];
                athleteMap[id].stats[catKey][label] = normalizeVal(val);
              }
            } else if (a.stats && typeof a.stats === "object") {
              // If stats already object keyed by label
              for (const [kk, vv] of Object.entries(a.stats || {})) {
                athleteMap[id].stats[catKey][kk] = normalizeVal(vv);
              }
            }
          }
        }

        // Build athletes array from map
        const athletes = Object.values(athleteMap).map((entry) => {
          const athleteId = entry.athlete?.id ? String(entry.athlete.id) : null;
          const oneQ = athleteId
            ? qStats[athleteId] || { PTS: 0, REB: 0, AST: 0 }
            : { PTS: 0, REB: 0, AST: 0 };

          const out = {
            active: entry.active,
            starter: entry.starter,
            athlete: entry.athlete,
            ...(isNFL || isNHL ? {} : { "1Q": oneQ }),
          };

          if (isNFL) {
            // For NFL keep grouped categories
            out.stats = entry.stats;
          } else {
            // For other sports flatten categories into a single flat stats map
            const flat = {};
            for (const catName of Object.keys(entry.stats || {})) {
              const catObj = entry.stats[catName] || {};
              for (const [label, val] of Object.entries(catObj)) {
                flat[label] = val;
              }
            }
            out.stats = flat;

            // Attach NHL power-play points (PP) if we computed them earlier
            try {
              if (isNHL && athleteId) {
                const pp = ppCounts[athleteId];
                // only attach for skaters (exclude goalies)
                const pos = entry.athlete?.position || null;
                if (
                  pp !== undefined &&
                  String(pos || "").toUpperCase() !== "G"
                ) {
                  out.stats = out.stats || {};
                  out.stats["PP"] = Number(pp) || 0;
                }
              }
            } catch (e) {
              /* non-fatal */
            }
          }

          return out;
        });

        return {
          team: {
            id: playerTeam.team?.id,
            abbreviation: playerTeam.team?.abbreviation,
            displayName: playerTeam.team?.displayName,
          },
          statistics: {
            athletes,
          },
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
    console.warn(
      "transformSummaryData: failed to build athleteNameById map",
      e?.message || e,
    );
  }

  // UEFA-specific: enrich rosters, extract first/last goals from keyEvents,
  // and simplify commentary. Detect UEFA via sportHint.
  const isUEFA = /uefa|champions|uefa.champions/i.test(sportHint);
  if (isUEFA) {
    try {
      // Prefer boxscore.rosters, fall back to top-level data.rosters
      const rawRosters =
        data.boxscore &&
        Array.isArray(data.boxscore.rosters) &&
        data.boxscore.rosters.length
          ? data.boxscore.rosters
          : Array.isArray(data.rosters)
            ? data.rosters
            : [];
      if (rawRosters && rawRosters.length) {
        transformed.rosters = rawRosters.map((r) => {
          const team = Object.assign({}, r.team || {});
          if (team.logos) delete team.logos;
          const roster = (r.roster || []).map((p) => {
            const np = Object.assign({}, p || {});
            if (np.athlete) {
              np.athlete = {
                id: String(np.athlete.id || np.athlete.uid || "") || null,
                lastName: np.athlete.lastName || null,
                displayName: np.athlete.displayName || null,
              };
            }
            if (np.position) {
              np.position = { abbreviation: np.position.abbreviation || null };
            }
            if (np.formationPlace) delete np.formationPlace;
            if (np.media) delete np.media;
            if (Array.isArray(np.stats)) {
              const statsObj = {};
              np.stats.forEach((s) => {
                if (s && s.abbreviation)
                  statsObj[s.abbreviation] = s.displayValue;
              });
              np.stats = statsObj;
            }
            return np;
          });
          return { homeAway: r.homeAway, team, roster };
        });

        // Build normalized name -> id map from transformed rosters for resolving participants
        const normalizeRosterName = (s) =>
          String(s || "")
            .normalize("NFD")
            .replace(/\p{Diacritic}/gu, "")
            .replace(/[^ -]/g, "")
            .replace(/[^\\w\s]/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();

        const rosterNameToId = {};
        transformed.rosters.forEach((r) => {
          (r.roster || []).forEach((p) => {
            const a = p.athlete || {};
            if (a.displayName)
              rosterNameToId[normalizeRosterName(a.displayName)] = a.id;
          });
        });

        // Extract first/last goal from keyEvents (first scoringPlay where type.id !== 97)
        const keyEvents = Array.isArray(data.keyEvents) ? data.keyEvents : [];
        let uFirstGoal = null;
        let uLastGoal = null;
        for (const ke of keyEvents) {
          if (ke && ke.scoringPlay && ke.type && ke.type.id !== "97") {
            // Build normalized goal object with athleteId and athleteName when available
            let goalObj = null;
            if (Array.isArray(ke.participants) && ke.participants.length > 0) {
              const part = ke.participants[0];
              // Prefer explicit athlete.id if present in keyEvents
              const athleteIdRaw =
                part?.athlete?.id || part?.athlete?.externalId || null;
              const athleteName =
                part?.athlete?.displayName ||
                part?.displayName ||
                part?.name ||
                null;
              let athleteId = null;
              if (athleteIdRaw) athleteId = String(athleteIdRaw);
              else if (athleteName)
                athleteId =
                  rosterNameToId[normalizeRosterName(athleteName)] || null;

              if (athleteId) {
                goalObj = {
                  athleteId: athleteId,
                  athleteName: athleteName || null,
                  teamId: ke.team?.id || null,
                  team: ke.team?.displayName || null,
                  period: ke.period?.number || null,
                  scoreValue: ke.scoreValue || null,
                  playIndex: ke.id || ke.sequenceNumber || null,
                };
              } else {
                // fallback to name-only object
                const name = athleteName || null;
                goalObj = {
                  athleteId: null,
                  athleteName: name,
                  teamId: ke.team?.id || null,
                  team: ke.team?.displayName || null,
                  period: ke.period?.number || null,
                  scoreValue: ke.scoreValue || null,
                  playIndex: ke.id || ke.sequenceNumber || null,
                };
              }
            }

            if (goalObj) {
              if (!uFirstGoal) uFirstGoal = goalObj;
              uLastGoal = goalObj;
            }
          }
        }
        if (uFirstGoal) transformed.firstGoal = uFirstGoal;
        // only expose lastGoal when game is finished/post
        const gameStateUEFA = String(
          data?.meta?.gameState ||
            data.header?.competitions?.[0]?.status?.type?.state ||
            "",
        ).toLowerCase();
        if (uLastGoal && gameStateUEFA === "post")
          transformed.lastGoal = uLastGoal;

        // UEFA should not include firstBasket
        if (transformed.firstBasket) delete transformed.firstBasket;

        // Commentary: only last object, bring play.time to parent and simplify play
        const commentary = Array.isArray(data.commentary)
          ? data.commentary
          : [];
        const lastComment = commentary.length
          ? commentary[commentary.length - 1]
          : null;
        if (lastComment) {
          const c = Object.assign({}, lastComment || {});
          if (c.play) {
            if (c.play.time) c.time = c.play.time;
            const play = c.play;
            const simplePlay = {
              type: play.type,
              text: play.text,
              period: play.period,
              clock: play.clock,
              team: play.team,
              participants: Array.isArray(play.participants)
                ? play.participants.map((part) => {
                    const name =
                      part?.displayName ||
                      part?.athlete?.displayName ||
                      part?.name ||
                      null;
                    const id = name
                      ? rosterNameToId[normalizeRosterName(name)] || null
                      : null;
                    return id ? { [id]: name } : { displayName: name };
                  })
                : [],
              fieldPositionX: play.fieldPositionX,
              fieldPositionY: play.fieldPositionY,
              fieldPosition2X: play.fieldPosition2X,
              fieldPosition2Y: play.fieldPosition2Y,
            };
            c.play = simplePlay;
          }
          transformed.commentary = c;
        }
      }
    } catch (e) {
      console.warn("transformSummaryData: UEFA enrich failed", e?.message || e);
    }
  }

  // Build reverse lookup name -> id (normalized) to resolve scorer names from scoringPlays
  const normalizeAthleteName = (s) =>
    String(s || "")
      .toLowerCase()
      .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
      .replace(/[^\w\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const athleteIdByName = {};
  try {
    for (const [id, name] of Object.entries(athleteNameById || {})) {
      if (!name) continue;
      const key = normalizeAthleteName(name);
      athleteIdByName[key] = id;
    }
  } catch (e) {
    /* ignore */
  }

  // After building the athlete lookup, attach athleteName to firstBasket (if we found one earlier)
  if (!isNFL && !isNHL) {
    if (firstBasket && firstBasket.athleteId) {
      firstBasket.athleteName =
        athleteNameById[firstBasket.athleteId] ||
        firstBasket.athleteName ||
        null;
    }
    transformed.firstBasket = firstBasket;
  } else if (isNHL) {
    // For NHL attach firstGoal and lastGoal (lastGoal only meaningful after game is post)
    if (firstGoal && firstGoal.athleteId) {
      firstGoal.athleteName =
        athleteNameById[firstGoal.athleteId] || firstGoal.athleteName || null;
    }
    // only expose lastGoal if game is finished/post
    const gameState = String(data?.meta?.gameState || "").toLowerCase();
    if (lastGoal && lastGoal.athleteId && gameState === "post") {
      lastGoal.athleteName =
        athleteNameById[lastGoal.athleteId] || lastGoal.athleteName || null;
    } else {
      lastGoal = null;
    }
    transformed.firstGoal = firstGoal;
    transformed.lastGoal = lastGoal;
  } else {
    // For NFL compute firstTouchdown and lastTouchdown from scoringPlays
    if (Array.isArray(data.scoringPlays) && data.scoringPlays.length > 0) {
      const tdPlays = data.scoringPlays.filter(
        (p) =>
          (p.type &&
            String(p.type.abbreviation || "").toUpperCase() === "TD") ||
          p.scoringPlay,
      );
      if (tdPlays.length > 0) {
        const first = tdPlays[0];
        const last = tdPlays[tdPlays.length - 1];
        const extractScorer = (play) => {
          const pid =
            play.participants &&
            play.participants[0] &&
            (play.participants[0].athlete?.id ||
              play.participants[0].athlete?.externalId);
          if (pid)
            return {
              athleteId: String(pid),
              athleteName: athleteNameById[String(pid)] || null,
            };
          const txt = String(play.text || play.shortDescription || "");
          const m = txt.match(/^([^0-9\(]+?)\s+\d+\s*yd/i);
          let nameGuess = null;
          if (m && m[1]) nameGuess = m[1].trim();
          else nameGuess = txt.split(" ").slice(0, 3).join(" ");

          // Try to resolve the guessed name against athleteIdByName
          try {
            const key = normalizeAthleteName(nameGuess || "");
            const foundId = athleteIdByName[key];
            if (foundId)
              return {
                athleteId: String(foundId),
                athleteName: athleteNameById[String(foundId)] || nameGuess,
              };
          } catch (e) {
            /* ignore */
          }

          return { athleteId: null, athleteName: nameGuess };
        };
        const firstScorer = extractScorer(first);
        const firstTouchdown = {
          athleteId: firstScorer.athleteId || null,
          athleteName: firstScorer.athleteName || null,
          teamId: first.team?.id || first.teamId || null,
          teamDisplayName: first.team?.displayName || null,
          text: first.text || first.shortDescription || null,
          period: first.period?.number || null,
        };
        transformed.firstTouchdown = firstTouchdown;
        const state =
          data.header?.competitions?.[0]?.status?.type?.state || null;
        if (state === "post") {
          const lastScorer = extractScorer(last);
          transformed.lastTouchdown = {
            athleteId: lastScorer.athleteId || null,
            athleteName: lastScorer.athleteName || null,
            teamId: last.team?.id || last.teamId || null,
            teamDisplayName: last.team?.displayName || null,
            text: last.text || last.shortDescription || null,
            period: last.period?.number || null,
          };
        }
      }
    }
  }

  // GameInfo - venue only
  if (data.gameInfo?.venue) {
    transformed.gameInfo = {
      venue: data.gameInfo.venue.fullName,
    };
  }

  // LastFiveGames - prefer boxscore.form (UEFA) otherwise fall back to data.lastFiveGames
  if (
    data.boxscore &&
    Array.isArray(data.boxscore.form) &&
    data.boxscore.form.length > 0
  ) {
    transformed.lastFiveGames = data.boxscore.form.map((teamGames) => ({
      team: {
        id: teamGames.team?.id,
        displayName: teamGames.team?.displayName,
        abbreviation: teamGames.team?.abbreviation,
      },
      events: teamGames.events?.map((event) => ({
        id: event.id,
        opponent: event.opponent?.displayName,
        opponentAbbreviation: event.opponent?.abbreviation,
        opponentId: event.opponent?.id,
        atVs: event.atVs,
        date: event.gameDate,
        score: event.score,
        result: event.gameResult,
      })),
    }));
  } else if (data.lastFiveGames) {
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
        opponentId: event.opponent?.id,
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
      (wp) => wp.homeWinPercentage,
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
    const lastPlay = data.plays[data.plays.length - 1];
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
      team: getTeamAbbreviationById(lastPlay.team?.id, transformSportKey),
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

  // Drives (NFL): flatten previous/current/all structures and return the last drive
  if (isNFL && data.drives) {
    try {
      // Helper: sanitize a play object for public output
      const sanitizePlay = (pl) => {
        if (!pl || typeof pl !== "object") return pl;
        // shallow copy
        const copy = Object.assign({}, pl);
        // remove drive-level unwanted fields
        if (copy.teamParticipants) delete copy.teamParticipants;
        if (copy.wallclock) delete copy.wallclock;
        if (copy.wallClock) delete copy.wallClock;
        if (copy.modified) delete copy.modified;

        // sanitize participants
        if (Array.isArray(copy.participants)) {
          copy.participants = copy.participants.map((p) => {
            if (!p || typeof p !== "object") return p;
            const np = Object.assign({}, p);
            if (np.playStatistics) delete np.playStatistics;
            if (np.uid) delete np.uid;
            if (np.guid) delete np.guid;
            if (np.athlete && typeof np.athlete === "object") {
              const a = Object.assign({}, np.athlete);
              if (a.links) delete a.links;
              if (a.headshot) delete a.headshot;
              if (a.status) delete a.status;
              if (a.collegeAthlete) delete a.collegeAthlete;
              if (a.uid) delete a.uid;
              if (a.guid) delete a.guid;
              np.athlete = a;
            }
            return np;
          });
        }

        return copy;
      };
      const combined = [];
      const maybeArrays = [
        data.drives.previous,
        data.drives.current,
        data.drives.all,
      ].filter(Boolean);
      for (const item of maybeArrays) {
        if (Array.isArray(item)) {
          for (const e of item) {
            if (Array.isArray(e)) combined.push(...e);
            else combined.push(e);
          }
        } else if (item && typeof item === "object") {
          for (const v of Object.values(item || {})) {
            if (Array.isArray(v)) combined.push(...v);
          }
        }
      }
      if (combined.length === 0 && typeof data.drives.previous === "object") {
        for (const v of Object.values(data.drives.previous || {})) {
          if (Array.isArray(v)) combined.push(...v);
        }
      }
      if (combined.length > 0) {
        const lastDrive = combined[combined.length - 1];
        const driveOut = {};

        for (const k of Object.keys(lastDrive || {})) {
          // Skip drive-level fields we don't want to expose
          if (
            k === "teamParticipants" ||
            k === "wallclock" ||
            k === "wallClock" ||
            k === "modified"
          )
            continue;

          if (k === "team") {
            driveOut.team = {
              id: lastDrive.team?.id || null,
              name: lastDrive.team?.name || lastDrive.team?.displayName || null,
              abbreviation: lastDrive.team?.abbreviation || null,
              displayName: lastDrive.team?.displayName || null,
            };
            continue;
          }

          if (k === "isScore") continue;

          if (k === "plays" && Array.isArray(lastDrive.plays)) {
            // Build sanitized plays array for output
            driveOut.plays = lastDrive.plays.map((pl) => sanitizePlay(pl));
            continue;
          }

          driveOut[k] = lastDrive[k];
        }

        // Ensure start.yardLine remains anchored to the FIRST play's start
        // while other drive-level fields remain taken from the last drive.
        try {
          if (Array.isArray(lastDrive.plays) && lastDrive.plays.length > 0) {
            const firstPlay = lastDrive.plays[0];
            const lastPlay = lastDrive.plays[lastDrive.plays.length - 1];

            // If a start object exists, override only its yardLine with the first play's start.yardLine
            const firstYardLine = firstPlay?.start?.yardLine ?? null;
            if (firstYardLine != null) {
              driveOut.start = {
                ...(driveOut.start || lastDrive.start || {}),
                yardLine: firstYardLine,
              };
            } else if (driveOut.start == null && lastDrive.start) {
              driveOut.start = lastDrive.start;
            }

            // Ensure end comes from the most recent (last) play's end when available
            if (lastPlay?.end) {
              driveOut.end = lastPlay.end;
            } else if (driveOut.end == null && lastDrive.end) {
              driveOut.end = lastDrive.end;
            }
          }
        } catch (e) {
          // keep original driveOut if something unexpected occurs
        }

        // expose driveOut under `current` to match ESPN structure
        transformed.drives = { current: driveOut };

        // Add `allStart` array: start.yardLine for each play in the current drives plays
        try {
          // Use sanitized plays for allStart and start selection
          const rawPlays = data.drives?.current?.plays || lastDrive.plays || [];
          const playsSanitized = Array.isArray(rawPlays)
            ? rawPlays.map((pl) => sanitizePlay(pl))
            : [];
          if (playsSanitized.length > 0) {
            // Exclude plays with type.id === "53" or "52" (kickoff/penalty types)
            transformed.drives.current.allStart = playsSanitized
              .filter((pl) => {
                const tid = pl?.type?.id ?? null;
                const sid = tid == null ? null : String(tid);
                return sid !== "53" && sid !== "52";
              })
              .map((pl) => pl?.start?.yardLine ?? null);

            // Choose the drive-level start yardLine according to rule:
            // - If the current drive's type.id is 53 or 52, use the direct yardLine from the source
            // - Otherwise prefer the first element of `allStart`
            try {
              const currentTypeId = String(
                data.drives?.current?.type?.id ?? lastDrive?.type?.id ?? "",
              );
              const firstAll =
                (transformed.drives.current.allStart &&
                  transformed.drives.current.allStart.length > 0 &&
                  transformed.drives.current.allStart[0]) ||
                null;

              // If type is 53 or 52, prefer the direct source yardLine
              if (currentTypeId === "53" || currentTypeId === "52") {
                const directY =
                  data.drives?.current?.start?.yardLine ??
                  lastDrive?.start?.yardLine ??
                  null;
                if (directY != null) {
                  transformed.drives.current.start = {
                    ...(transformed.drives.current.start || {}),
                    yardLine: directY,
                  };
                }
              } else if (firstAll != null) {
                // Use the first allStart value when available
                transformed.drives.current.start = {
                  ...(transformed.drives.current.start || {}),
                  yardLine: firstAll,
                };
              }
            } catch (e) {
              /* ignore calculation errors */
            }
          }
        } catch (e) {
          /* ignore */
        }
      }
    } catch (e) {
      /* ignore */
    }
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
          record: { summary: competitor.record?.[0]?.summary || null },
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

    let athletes = healthyAthletes.map((athlete) => {
      const gamelog = (gamelogs && gamelogs[athlete.id]) || null;

      // Determine athlete name robustly: prefer `name`, then `firstName/lastName`,
      // then `displayName`, then `shortName`.
      const resolvedName =
        athlete.name ||
        `${athlete.firstName || ""} ${athlete.lastName || ""}`.trim() ||
        athlete.displayName ||
        athlete.shortName ||
        null;

      // Position may be an object with abbreviation or already an abbreviation string
      const resolvedPosition =
        (athlete.position && athlete.position.abbreviation) ||
        athlete.position ||
        null;

      // Base athlete info (omit shortName and position for ESPN outputs)
      const athleteData = {
        id: athlete.id,
        name: resolvedName,
        jersey: athlete.jersey,
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
          (a, b) => new Date(b.gameDate) - new Date(a.gameDate),
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
                      const key =
                        displayNames[index] &&
                        String(displayNames[index]).trim()
                          ? String(displayNames[index])
                          : names[index] && String(names[index]).trim()
                            ? String(names[index])
                            : label;
                      formattedStats[key] = stats[index];
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
                  1,
                );

                averages = formattedAverages;
              }
            });
          }
        });

        athleteData.recentGames = recentGames;
        athleteData.averages = averages;
        // Pass opponent ID to odds generation
        const rawOdds = generatePlayerOdds(
          gamelog,
          opponentId ? { id: opponentId } : null,
        );
        // Filter out passing_longestCompletion markets
        athleteData.odds = Array.isArray(rawOdds)
          ? rawOdds.filter((m) => m && m.statID !== "passing_longestCompletion")
          : rawOdds;
      } else if (athlete.odds) {
        // If no gamelog was fetched but odds were attached earlier (e.g. from SGO cache),
        // preserve those odds instead of attempting to index into undefined gamelogs.
        // Filter out passing_longestCompletion markets
        athleteData.odds = Array.isArray(athlete.odds)
          ? athlete.odds.filter(
              (m) => m && m.statID !== "passing_longestCompletion",
            )
          : athlete.odds;
      }

      return athleteData;
    });

    // Filter out any athletes that do not have odds attached (we only want
    // roster entries that include SGO-derived odds). This ensures roster
    // payloads don't contain players without odds.
    athletes = athletes.filter((a) => a && a.odds);

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
async function fetchScoreboard(sport = "nba") {
  try {
    const sportKey = String(sport || "nba").toLowerCase();
    const urls = ESPN_PATHS[sportKey] || ESPN_PATHS["nba"];
    const dateParam = getScoreboardDate();
    const response = await axios.get(
      `${urls.base}/scoreboard?dates=${dateParam}`,
    );
    // store per-sport and keep a fallback reference
    scoreboardDataBySport[sportKey] = response.data;
    scoreboardData = response.data;

    // Check game statuses and update scheduling
    updateSchedulingLogic();

    return scoreboardData;
  } catch (error) {
    console.error(
      `[Scoreboard:${sport}] Error fetching data:`,
      error?.message || error,
    );
    return null;
  }
}

async function fetchSummary(eventId, sport) {
  try {
    // Determine sportKey: explicit param, infer from cached scoreboard, or default to 'nba'
    let sportKey = (sport || "").toLowerCase();
    if (!sportKey) {
      try {
        if (scoreboardData && Array.isArray(scoreboardData.events)) {
          const ev = scoreboardData.events.find(
            (e) => String(e.id) === String(eventId),
          );
          if (ev && ev.sport && ev.sport.slug) {
            // map slug like 'nba' or 'football' to our ESPN_PATHS keys
            const slug = String(ev.sport.slug || "").toLowerCase();
            if (ESPN_PATHS[slug]) sportKey = slug;
            else {
              // try common mappings
              if (slug.includes("football")) sportKey = "nfl";
              else if (slug.includes("hockey")) sportKey = "nhl";
              else if (slug.includes("basketball")) sportKey = "nba";
              else if (slug.includes("soccer")) sportKey = "uefa";
            }
          }
        }
      } catch (e) {
        /* ignore */
      }
    }

    const urls =
      ESPN_PATHS[sportKey] && ESPN_PATHS[sportKey].base
        ? ESPN_PATHS[sportKey]
        : { base: ESPN_BASE_URL };
    const response = await axios.get(`${urls.base}/summary?event=${eventId}`);
    response.data.lastPolledTime = new Date();
    summaryDataCache[eventId] = response.data;
    return response.data;
  } catch (error) {
    // Suppress 404 logs (expected for invalid/old event IDs), log other errors
    if (error?.response?.status !== 404) {
      console.error(
        `[Summary] Error fetching data for event ${eventId}:`,
        error?.message || error,
      );
    }
    return null;
  }
}

async function fetchTeamRoster(teamId) {
  try {
    console.log(`[Roster] Fetching data for team ${teamId}...`);
    // Attempt to use sport-specific ESPN path by inferring sport from scoreboardData
    let baseUrl = ESPN_BASE_URL;
    try {
      if (scoreboardData && Array.isArray(scoreboardData.events)) {
        const ev = scoreboardData.events.find((e) => {
          return (e.competitions || []).some((c) =>
            (c.competitors || []).some(
              (comp) => String(comp.team?.id) === String(teamId),
            ),
          );
        });
        const slug = ev?.sport?.slug
          ? String(ev.sport.slug).toLowerCase()
          : null;
        if (slug) {
          if (ESPN_PATHS[slug] && ESPN_PATHS[slug].base)
            baseUrl = ESPN_PATHS[slug].base;
          else if (slug.includes("football")) baseUrl = ESPN_PATHS["nfl"].base;
          else if (slug.includes("hockey")) baseUrl = ESPN_PATHS["nhl"].base;
          else if (slug.includes("basketball"))
            baseUrl = ESPN_PATHS["nba"].base;
          else if (slug.includes("soccer")) baseUrl = ESPN_PATHS["uefa"].base;
        }
      }
    } catch (e) {
      /* ignore */
    }
    const response = await axios.get(`${baseUrl}/teams/${teamId}/roster`);
    console.log(`[Roster] Data fetched successfully for team ${teamId}`);
    return response.data;
  } catch (error) {
    console.error(
      `[Roster] Error fetching data for team ${teamId}:`,
      error.message,
    );
    return null;
  }
}

async function fetchAthleteGamelog(athleteId) {
  try {
    console.log(`[Gamelog] Fetching data for athlete ${athleteId}...`);
    const response = await axios.get(
      `${ESPN_WEB_API_URL}/athletes/${athleteId}/gamelog`,
    );
    console.log(`[Gamelog] Data fetched successfully for athlete ${athleteId}`);
    return response.data;
  } catch (error) {
    console.error(
      `[Gamelog] Error fetching data for athlete ${athleteId}:`,
      error.message,
    );
    return null;
  }
}

async function fetchRosterAndGamelogs(teamId, opponentId = null) {
  try {
    console.log(
      `[Roster+Gamelog] Fetching combined data for team ${teamId}...`,
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
      `[Roster+Gamelog] Combined data fetched successfully for team ${teamId}`,
    );

    return combinedData;
  } catch (error) {
    console.error(
      `[Roster+Gamelog] Error fetching combined data for team ${teamId}:`,
      error.message,
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
      error.message,
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
        "[Scheduler] Live games or game starting soon detected. Switching to 2-second interval.",
      );
      startScoreboardFastPolling();
    } else if (newPollingMode === "moderate") {
      console.log(
        "[Scheduler] Scheduled games detected. Switching to 90-second interval.",
      );
      startScoreboardModeratePolling();
    } else {
      console.log(
        "[Scheduler] No live or upcoming games. Switching to 30-minute interval.",
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
        2000,
      );
    } else if (!shouldFastPoll && hasInterval) {
      console.log(
        `[Summary Scheduler] Stopping fast polling for event ${eventId}`,
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
    // Refresh rosters for all supported sports at daily cron
    await Promise.all(
      Object.keys(SGO_LEAGUE_IDS).map((sport) => fetchRostersForSport(sport)),
    );
  },
  {
    timezone: "America/Los_Angeles",
  },
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
      // Check any rosterCache entry age
      const anyRecent = Object.values(rosterCache || {}).some((c) => {
        if (!c || !c.lastFetched) return false;
        return getTimeDifferenceInMinutes(now, new Date(c.lastFetched)) <= 5;
      });
      if (!anyRecent) {
        console.log(
          `[Game Start] Updating rosters for all sports (games starting)`,
        );
        await Promise.all(
          Object.keys(SGO_LEAGUE_IDS).map((s) => fetchRostersForSport(s)),
        );
        break;
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
      rosters: "/api/rosters/:sport",
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
      scoreboard:
        "/api/scoreboard/:sport?dates=YYYYMMDD (supported: nba, nhl, nfl, uefa)",
    },
    status: {
      isAnyGameLive,
      nextGameStart: nextGameStartTime,
      cachedEvents: Object.keys(summaryDataCache).length,
      cachedRosters: Object.keys(rosterCache || {}).length
        ? "cached"
        : "not cached",
      pollingMode: currentPollingMode,
    },
    deployment: {
      platform: "Railway",
      customApiUrl: "https://laraiyeogithubio-production-f5af.up.railway.app",
      fallbackApi: "ESPN",
    },
  });
});

app.get("/api/scoreboard/:sport", async (req, res) => {
  try {
    const { sport } = req.params;

    // Fetch scoreboard for requested sport (defaults to nba)
    const data = await fetchScoreboard(sport || "nba");

    if (!data) {
      return res
        .status(500)
        .json({ error: `Failed to fetch ${sport || "nba"} scoreboard` });
    }

    // Transform and return only the filtered data
    const transformedData = transformScoreboardData(data);
    res.json(transformedData || { error: "Failed to fetch scoreboard data" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Odds endpoint using SportGameOdds (cached, refreshed every 2 hours)
app.get("/api/odds/:sport", async (req, res) => {
  try {
    const { sport } = req.params;
    const key = String(sport || "nba").toLowerCase();

    // Helper to filter out passing_longestCompletion from events
    const filterEvents = (events) => {
      if (!Array.isArray(events)) return events;
      return events.map((event) => {
        if (!event || !event.odds || !event.odds.players) return event;
        const filteredPlayers = {};
        for (const [playerId, markets] of Object.entries(event.odds.players)) {
          filteredPlayers[playerId] = Array.isArray(markets)
            ? markets.filter(
                (m) => m && m.statID !== "passing_longestCompletion",
              )
            : markets;
        }
        return {
          ...event,
          odds: {
            ...event.odds,
            players: filteredPlayers,
          },
        };
      });
    };

    // If we have cached data and it's still fresh, return it immediately.
    const entry = oddsCache[key];
    if (entry && entry.data) {
      const age = Date.now() - (entry.lastFetched || 0);
      if (age < SGO_CACHE_TTL_MS) {
        return res.json({
          lastFetched: new Date(entry.lastFetched),
          events: filterEvents(entry.data),
        });
      }

      // Stale: return cached immediately and trigger a background refresh (non-blocking).
      if (!entry.isFetching) {
        fetchSGOOdds(key).catch((e) =>
          console.error("Background SGO fetch failed:", e),
        );
      }
      return res.json({
        lastFetched: new Date(entry.lastFetched),
        events: filterEvents(entry.data),
        stale: true,
      });
    }

    // No cache present: do not block on SGO fetch. Trigger background fetch and return 503
    if (!entry)
      oddsCache[key] = { lastFetched: 0, data: null, isFetching: false };
    if (!oddsCache[key].isFetching) {
      fetchSGOOdds(key).catch((e) =>
        console.error("Background SGO fetch failed:", e),
      );
    }
    return res
      .status(503)
      .json({ error: "Odds cache not ready yet", retryAfterSeconds: 30 });
  } catch (err) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

app.get("/api/summary/:sport/:eventId", async (req, res) => {
  try {
    const rawParam = String(req.params.sport || "nba");
    const explicitEventId = req.params.eventId
      ? String(req.params.eventId)
      : null;
    // If an explicit :eventId param was provided, use that for event-based summary
    if (explicitEventId) {
      const eventId = explicitEventId;
      try {
        // Check cache first
        const old = summaryDataCache[eventId];
        const newSummary = await fetchSummary(eventId, rawParam);

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
            if (
              oldState === "pre" &&
              newState === "in" &&
              lastBroadcast !== "in"
            ) {
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
                comp?.competitors?.find((c) => c.homeAway === "home")?.score ||
                0;
              const awayScore =
                comp?.competitors?.find((c) => c.homeAway === "away")?.score ||
                0;
            }
          }
        } catch (e) {
          console.error("Error comparing summary states", e?.message || e);
        }

        // Transform and return only the filtered data (prefer freshly fetched summary)
        let transformedData = transformSummaryData(
          newSummary || summaryDataCache[eventId],
        );

        // Attempt to attach SGO odds for this event (if odds cache available)
        try {
          const sportKey = rawParam.toLowerCase();
          const sgoEvents =
            (oddsCache[sportKey] && oddsCache[sportKey].data) || [];
          if (
            sgoEvents &&
            sgoEvents.length > 0 &&
            transformedData?.header?.competitions?.[0]
          ) {
            const comp = transformedData.header.competitions[0];
            const competitors = comp.competitors || [];
            const home = competitors.find((c) => c.homeAway === "home");
            const away = competitors.find((c) => c.homeAway === "away");
            const normalize = (s) => {
              if (!s) return "";
              try {
                return String(s)
                  .normalize("NFD")
                  .replace(/\p{Diacritic}/gu, "")
                  .replace(/[^a-zA-Z0-9\s]/g, " ")
                  .replace(/\s+/g, " ")
                  .trim()
                  .toLowerCase();
              } catch (e) {
                return String(s).toLowerCase();
              }
            };

            const homeName = normalize(
              home?.team?.displayName || home?.team?.abbreviation || "",
            );
            const awayName = normalize(
              away?.team?.displayName || away?.team?.abbreviation || "",
            );

            // build quick index
            const sgoIndexByNormalizedTeamPair = {};
            for (const ev of sgoEvents) {
              const evHome = normalize(
                ev.teams?.home?.name || ev.teams?.home?.abbr || "",
              );
              const evAway = normalize(
                ev.teams?.away?.name || ev.teams?.away?.abbr || "",
              );
              sgoIndexByNormalizedTeamPair[`${evHome}||${evAway}`] = ev;
            }

            let sgoMatch =
              sgoIndexByNormalizedTeamPair[`${homeName}||${awayName}`] || null;
            if (!sgoMatch) {
              for (const ev of sgoEvents) {
                const evHome = normalize(
                  ev.teams?.home?.name || ev.teams?.home?.abbr || "",
                );
                const evAway = normalize(
                  ev.teams?.away?.name || ev.teams?.away?.abbr || "",
                );
                if (
                  (evHome && evHome === homeName && evAway === awayName) ||
                  (evHome && evHome === awayName && evAway === homeName)
                ) {
                  sgoMatch = ev;
                  break;
                }
                if (
                  (evHome && evHome.includes(homeName)) ||
                  (evAway && evAway.includes(awayName))
                ) {
                  sgoMatch = ev; // weak match
                  break;
                }
              }
            }

            if (sgoMatch) {
              try {
                const sgoHomeOdds = sgoMatch.odds?.teams?.home || null;
                const sgoAwayOdds = sgoMatch.odds?.teams?.away || null;
                if (home && !home.record) home.record = {};
                if (away && !away.record) away.record = {};
                if (home) home.record.odds = { sgo: sgoHomeOdds };
                if (away) away.record.odds = { sgo: sgoAwayOdds };
                if (
                  sgoMatch.odds &&
                  Array.isArray(sgoMatch.odds.all) &&
                  sgoMatch.odds.all.length > 0
                ) {
                  // Attach SGO markets at the top-level only and remove any
                  // legacy competition-level `pickcenter` to avoid duplicate data.
                  transformedData.pickcenter = { all: sgoMatch.odds.all };
                  try {
                    if (comp && comp.pickcenter) delete comp.pickcenter;
                  } catch (delErr) {
                    /* non-fatal */
                  }
                }
              } catch (e) {
                console.warn(
                  `[Summary:${sportKey}] failed to attach SGO odds to event ${eventId}:`,
                  e?.message || e,
                );
              }
            } else {
              console.debug(
                `[Summary:${sportKey}] SGO events:${
                  sgoEvents.length
                } no match for ${homeName}||${awayName}. SGO sample keys: ${sgoEvents
                  .slice(0, 6)
                  .map((ev) => {
                    const nH = normalize(
                      ev.teams?.home?.name || ev.teams?.home?.abbr || "",
                    );
                    const nA = normalize(
                      ev.teams?.away?.name || ev.teams?.away?.abbr || "",
                    );
                    return `${nH}||${nA}`;
                  })
                  .join(", ")}`,
              );
            }
          }
        } catch (e) {
          console.warn(
            `Error attaching SGO odds for event ${eventId}:`,
            e?.message || e,
          );
        }

        return res.json(
          transformedData || { error: "Failed to fetch summary data" },
        );
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }
    }

    // If the param looks like an ESPN eventId (numeric single-segment), allow that too
    if (/^\d+$/.test(rawParam)) {
      const eventId = rawParam;
      try {
        const old = summaryDataCache[eventId];
        const newSummary = await fetchSummary(eventId, rawParam);
        try {
          const oldState = old?.header?.competitions?.[0]?.status?.type?.state;
          const newState =
            newSummary?.header?.competitions?.[0]?.status?.type?.state;
          if (oldState && newState && oldState !== newState) {
            const comp = newSummary.header?.competitions?.[0];
            const lastBroadcast = eventBroadcastState[eventId] || null;
            if (
              oldState === "pre" &&
              newState === "in" &&
              lastBroadcast !== "in"
            ) {
              eventBroadcastState[eventId] = "in";
            }
            if (
              oldState === "in" &&
              newState === "post" &&
              lastBroadcast !== "post"
            ) {
              eventBroadcastState[eventId] = "post";
            }
          }
        } catch (e) {
          console.error("Error comparing summary states", e?.message || e);
        }
        const transformedData = transformSummaryData(
          newSummary || summaryDataCache[eventId],
        );
        return res.json(
          transformedData || { error: "Failed to fetch summary data" },
        );
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }
    }

    const sportKey = rawParam.toLowerCase();

    // Fetch latest scoreboard for sport
    const sb = await fetchScoreboard(sportKey);
    if (!sb || !sb.events)
      return res.status(503).json({ error: "scoreboard not available" });

    // Transform scoreboard into the familiar summary shape
    const transformedScore = transformScoreboardData(sb);

    // Try to grab SGO odds for this sport
    const sgoEvents = (oddsCache[sportKey] && oddsCache[sportKey].data) || [];
    if (!sgoEvents || sgoEvents.length === 0) {
      // Kick off a background fetch if empty
      if (!oddsCache[sportKey] || !oddsCache[sportKey].isFetching) {
        fetchSGOOdds(sportKey).catch((e) =>
          console.error(`[SGO:${sportKey}] background prime failed:`, e),
        );
      }
    }

    const normalize = (s) => {
      if (!s) return "";
      try {
        return String(s)
          .normalize("NFD")
          .replace(/\p{Diacritic}/gu, "")
          .replace(/[^a-zA-Z0-9\s]/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();
      } catch (e) {
        return String(s).toLowerCase();
      }
    };

    // For each event in the transformed scoreboard, attempt to find matching SGO event
    const sgoIndexByNormalizedTeamPair = {};
    for (const ev of sgoEvents) {
      const homeName = normalize(
        ev.teams?.home?.name || ev.teams?.home?.abbr || "",
      );
      const awayName = normalize(
        ev.teams?.away?.name || ev.teams?.away?.abbr || "",
      );
      const key = `${homeName}||${awayName}`;
      sgoIndexByNormalizedTeamPair[key] = ev;
    }

    // Attach odds to each competitor under competitor.record.odds and replace pickcenter with sgo 'all'
    if (
      transformedScore.header &&
      Array.isArray(transformedScore.header.competitions)
    ) {
      for (const comp of transformedScore.header.competitions) {
        const competitors = comp.competitors || [];
        const home = competitors.find((c) => c.homeAway === "home");
        const away = competitors.find((c) => c.homeAway === "away");
        const homeName = normalize(
          home?.team?.displayName || home?.team?.abbreviation || "",
        );
        const awayName = normalize(
          away?.team?.displayName || away?.team?.abbreviation || "",
        );

        // try exact pairing
        let sgoMatch =
          sgoIndexByNormalizedTeamPair[`${homeName}||${awayName}`] || null;

        // fallback: try matching by home OR away name individually
        if (!sgoMatch) {
          for (const ev of sgoEvents) {
            const evHome = normalize(
              ev.teams?.home?.name || ev.teams?.home?.abbr || "",
            );
            const evAway = normalize(
              ev.teams?.away?.name || ev.teams?.away?.abbr || "",
            );
            if (
              (evHome && evHome === homeName && evAway === awayName) ||
              (evHome && evHome === awayName && evAway === homeName)
            ) {
              sgoMatch = ev;
              break;
            }
            // also allow substring matches
            if (
              (evHome && evHome.includes(homeName)) ||
              (evAway && evAway.includes(awayName))
            ) {
              sgoMatch = ev; // weak match
              break;
            }
          }
        }

        // Attach odds under competitor.record.odds
        if (sgoMatch) {
          try {
            const sgoHomeOdds = sgoMatch.odds?.teams?.home || null;
            const sgoAwayOdds = sgoMatch.odds?.teams?.away || null;
            if (!home.record) home.record = {};
            if (!away.record) away.record = {};
            home.record.odds = { sgo: sgoHomeOdds };
            away.record.odds = { sgo: sgoAwayOdds };

            // Replace pickcenter/top-level pick data with SGO 'all' markets for this event
            if (
              sgoMatch.odds &&
              Array.isArray(sgoMatch.odds.all) &&
              sgoMatch.odds.all.length > 0
            ) {
              // Attach SGO markets only at the top-level and remove any
              // existing competition-level `pickcenter` to avoid legacy duplicates.
              transformedScore.pickcenter = { all: sgoMatch.odds.all };
              try {
                if (comp && comp.pickcenter) delete comp.pickcenter;
              } catch (delErr) {
                /* non-fatal */
              }
            }
          } catch (e) {
            console.warn(
              `[Summary:${sportKey}] failed to attach SGO odds:`,
              e?.message || e,
            );
          }
        }
        // helpful debug: no SGO match found for this competition
        console.debug(
          `[Summary:${sportKey}] no SGO match for ${
            home?.team?.displayName || home?.team?.abbreviation
          } vs ${away?.team?.displayName || away?.team?.abbreviation}`,
        );
      }
    }

    return res.json(transformedScore || { error: "failed to build summary" });
  } catch (err) {
    console.error("/api/summary error", err?.message || err);
    return res.status(500).json({ error: "internal error" });
  }
});

app.get("/api/rosters/:sport", async (req, res) => {
  try {
    const { sport } = req.params;
    const key = String(sport || "nba").toLowerCase();

    const entry = rosterCache[key];
    if (entry && entry.data) {
      const age = Date.now() - (entry.lastFetched || 0);
      if (age < SGO_CACHE_TTL_MS) {
        const transformedData = transformRostersData(entry.data);
        return res.json(
          transformedData || { error: "Failed to fetch rosters data" },
        );
      }

      // Stale: return cached immediately and trigger a background refresh (non-blocking)
      if (!entry.isFetching) {
        fetchRostersForSport(key).catch((e) =>
          console.error("Background roster fetch failed:", e),
        );
      }
      const transformedData = transformRostersData(entry.data);
      return res.json({ ...transformedData, stale: true });
    }

    // No cache: trigger background fetch and return 503 so caller knows to retry
    if (!rosterCache[key])
      rosterCache[key] = { lastFetched: 0, data: null, isFetching: false };
    if (!rosterCache[key].isFetching) {
      fetchRostersForSport(key).catch((e) =>
        console.error("Background roster fetch failed:", e),
      );
    }
    return res
      .status(503)
      .json({ error: "Roster cache not ready yet", retryAfterSeconds: 30 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/betslip", async (req, res) => {
  try {
    const { gameId, ...playerBets } = req.query;

    // Support comma-separated gameId values
    // Example: gameId=G1_nba,G2_nba,G3_nhl
    const gameIdValues = gameId
      ? String(gameId)
          .split(",")
          .map((s) => s.trim())
      : [];

    // Extract sport from gameId (e.g., "401810365_nba" -> "nba")
    const getSportFromGameId = (gid) => {
      const match = String(gid || "").match(
        /_(nba|nfl|nhl|mlb|soccer|ncaa|wnba|uefa)$/i,
      );
      return match ? match[1].toLowerCase() : null;
    };

    // Determine if we have multiple sports in this betslip
    const sports = [
      ...new Set(gameIdValues.map(getSportFromGameId).filter(Boolean)),
    ];
    const isMultiSport = sports.length > 1;

    // Generic per-game param lookup helper (supports comma-separated values and sport suffixes)
    // Always tries sport-specific params first (e.g., total_nba), then falls back to non-suffixed params (e.g., total)
    const getParamValueForGame = (paramName, giIndex) => {
      const gameId = gameIdValues[giIndex];
      if (!gameId) return null;

      const sport = getSportFromGameId(gameId);

      // helper: case-insensitive lookup into req.query
      const findQueryValue = (name) => {
        if (!req.query) return undefined;
        const target = String(name || "").toLowerCase();
        for (const k of Object.keys(req.query || {})) {
          if (String(k || "").toLowerCase() === target) return req.query[k];
        }
        return undefined;
      };

      // Try sport-specific parameter first (always, not just for multi-sport)
      if (sport) {
        const sportParam = `${paramName}_${sport}`;
        const raw =
          findQueryValue(sportParam) ?? findQueryValue(`${paramName}${sport}`);
        if (raw !== undefined && raw !== null) {
          const parts = String(raw)
            .split(",")
            .map((s) => s.trim());
          // For multi-sport, find the index within this sport's games
          if (isMultiSport) {
            const sportGameIds = gameIdValues.filter(
              (gid) => getSportFromGameId(gid) === sport,
            );
            const sportIndex = sportGameIds.indexOf(gameId);
            return parts.length === 1 ? parts[0] : parts[sportIndex] || null;
          }
          // For single-sport, use giIndex
          return parts.length === 1 ? parts[0] : parts[giIndex] || null;
        }
      }

      // Fall back to non-suffixed parameter
      const raw = findQueryValue(paramName);
      if (raw === undefined || raw === null) return null;
      const parts = String(raw)
        .split(",")
        .map((s) => s.trim());
      return parts.length === 1 ? parts[0] : parts[giIndex] || null;
    };

    // Normalize player-style comma-joined key=value fragments.
    // Some clients send `p1_ugl=1+,p1_card=1+` (comma instead of `&`).
    // Expand those into separate entries on `playerBets` so downstream logic treats them as distinct bets.
    try {
      Object.keys(req.query || {}).forEach((k) => {
        const raw = req.query[k];
        if (typeof raw !== "string") return;
        if (raw.indexOf(",") === -1 || raw.indexOf("=") === -1) return;
        const parts = raw
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean);
        if (!parts.length) return;
        for (const part of parts) {
          const eq = part.indexOf("=");
          if (eq === -1) continue;
          const subk = part.substring(0, eq).trim();
          const subv = part.substring(eq + 1).trim();
          if (/^p\d+(_\w+)?$/.test(subk)) {
            // only add if not already present to avoid overwriting explicit params
            if (!playerBets[subk]) playerBets[subk] = subv;
          }
        }
        // If original key is a player stat (pN[_stat]) and the first comma-part is a simple value,
        // set the original key to its first value portion (helpful when clients send `p1_ugl=1+,p1_card=1+`).
        if (/^p\d+(_\w+)?$/.test(k)) {
          const first = parts[0];
          if (first && first.indexOf("=") === -1) playerBets[k] = first;
          else if (first && first.indexOf("=") !== -1)
            playerBets[k] = first.split("=")[1].trim();
        }
      });
    } catch (e) {
      /* ignore normalization errors */
    }

    // Helper: map common short stat aliases to a regex that can find the index in labels
    const findStatIndexByAlias = (labels = [], alias = "") => {
      if (!labels || !Array.isArray(labels)) return -1;
      const a = String(alias || "").toUpperCase();
      let regex = null;
      switch (a) {
        case "PYDS":
          regex = /pass(ing)?\b.*(yds|yards)|pass\s*yds/i;
          break;
        case "PRYDS":
          // composite: passing + rushing yards (handled as composite)
          return -2;
        case "RYDS":
          regex = /rush(ing)?\b.*(yds|yards)|rush\s*yds/i;
          break;
        case "RECYDS":
          regex = /rec(eiving)?\b.*(yds|yards)|rec\s*yds/i;
          break;
        case "PCMP":
        case "PATT":
          // Comp/Att composite parsing handled specially
          return -2;
        case "PINT":
          regex = /pass(ing)?\b.*int|int\b|intercept(ion|ions)/i;
          break;
        case "PLNG":
          regex = /pass(ing)?\b.*long|long\b|longest pass/i;
          break;
        case "PTD":
          // Passing TD (try to match passing TD label)
          regex = /pass(ing)?\b.*td|passing.*td|td\b/i;
          break;
        case "TDS":
          // Total touchdowns composite (rushing + receiving + defensive)
          return -2;
        case "RLNG":
          regex = /rush(ing)?\b.*long|long\b|longest rush/i;
          break;
        case "RREC":
          regex = /rec(eiving)?\b.*(rec|recs|receptions)|rec\b/i;
          break;
        case "RECLONG":
          regex = /rec(eiving)?\b.*long|long\b|longest rec/i;
          break;
        case "RRYDS":
          // composite: rushing + receiving yards
          return -2;
        case "RATT":
          regex = /car\b|att\b|carries|rush attempts|rush att/i;
          break;
        case "DSAC":
          regex = /sack(s)?\b|sacks/i;
          break;
        case "DTT":
          regex = /total\s*tackles?|combined\s*tackles?/i;
          break;
        case "DST":
          regex = /solo\s*tackles?/i;
          break;
        case "DAT":
          regex = /assisted\s*tackles?|ast\s*tackles?/i;
          break;
        case "KXP":
        case "KFG":
        case "KPTS":
          return -2;
        case "HGL":
        case "GOAL":
        case "GOALS":
          // NHL goals (can be yes/no or numeric)
          regex = /^g$|^goals?$|\bg\b/i;
          break;
        case "SHT":
        case "SOG":
          // NHL shots on goal
          regex = /sog|shots on goal|shots/i;
          break;
        case "GA":
          // NHL goals + assists composite
          return -2;
        case "BS":
          // NHL blocked shots
          regex = /^bs$|blocked shots|blocks/i;
          break;
        case "GSV":
          // NHL goalie saves
          regex = /^sv$|saves?|goalie saves/i;
          break;
        case "PTS":
          regex = /pts|points/i;
          break;
        case "AST":
          regex = /ast|assists/i;
          break;
        case "REB":
          regex = /reb|rebounds/i;
          break;
        case "3PT":
        case "THREES":
          regex = /3pt|three/i;
          break;
        case "PRA":
          // Points+Rebounds+Assists special composite handled elsewhere
          return -2; // signal composite
        case "PA":
          // Points + Assists
          return -2;
        case "PR":
          // Points + Rebounds
          return -2;
        case "RA":
          // Rebounds + Assists
          return -2;
        case "3PM":
        case "3PTM":
          regex = /3pt|three/i;
          break;
        case "STL":
        case "STEALS":
          regex = /stl|steals/i;
          break;
        case "BLK":
        case "BLOCKS":
          regex = /blk|blocks/i;
          break;
        case "1QPTS":
        case "1QAST":
        case "1QREB":
          // period-specific labels handled via resolvePlayerStatValue
          return -2;
        case "2DBL":
        case "DBL":
        case "DOUBLEDOUBLE":
          return -2;
        case "3DBL":
        case "TRIPLED":
        case "TRIPLEDOUBLE":
          return -2;
        default:
          regex = null;
      }
      if (!regex) return -1;
      return labels.findIndex((lab) => regex.test(String(lab || "")));
    };

    // Resolve a player's stat value by alias or composite name without reading definitions.txt
    const resolvePlayerStatValue = (
      athleteEntry,
      labels,
      statUpper,
      sportKeyGuess,
    ) => {
      // athleteEntry shape may be { athlete: {...}, stats: [...] } or a flat athlete object
      const athleteObj = athleteEntry.athlete || athleteEntry;
      // helper to read label-indexed stats array
      const readLabelIndex = (labelName) => {
        if (Array.isArray(labels) && Array.isArray(athleteEntry.stats)) {
          const idx = labels.findIndex(
            (l) => String(l).toUpperCase() === String(labelName).toUpperCase(),
          );
          if (idx >= 0) return parseFloat(athleteEntry.stats[idx]) || 0;
        }
        return null;
      };

      // helper to read nested properties (case-insensitive)
      const tryGet = (obj, keys) => {
        try {
          let cur = obj;
          for (const k of keys) {
            if (!cur) return null;
            if (cur[k] !== undefined) cur = cur[k];
            else if (cur[String(k).toLowerCase()] !== undefined)
              cur = cur[String(k).toLowerCase()];
            else if (cur[String(k).toUpperCase()] !== undefined)
              cur = cur[String(k).toUpperCase()];
            else return null;
          }
          return cur;
        } catch (e) {
          return null;
        }
      };

      // common simple aliases
      if (statUpper === "PTS")
        return (
          readLabelIndex("PTS") ??
          tryGet(athleteEntry, ["stats", "PTS"]) ??
          tryGet(athleteObj, ["stats", "PTS"]) ??
          tryGet(athleteObj, ["pts"]) ??
          0
        );
      if (statUpper === "REB")
        return (
          readLabelIndex("REB") ??
          tryGet(athleteEntry, ["stats", "REB"]) ??
          tryGet(athleteObj, ["stats", "REB"]) ??
          tryGet(athleteObj, ["reb"]) ??
          0
        );
      if (statUpper === "AST")
        return (
          readLabelIndex("AST") ??
          tryGet(athleteEntry, ["stats", "AST"]) ??
          tryGet(athleteObj, ["stats", "AST"]) ??
          tryGet(athleteObj, ["ast"]) ??
          0
        );

      // PRA = PTS + REB + AST
      if (statUpper === "PRA") {
        const ptsLabel = readLabelIndex("PTS");
        const ptsEntry = tryGet(athleteEntry, ["stats", "PTS"]);
        const ptsObj = tryGet(athleteObj, ["stats", "PTS"]);
        const ptsFlat = tryGet(athleteObj, ["pts"]);
        const pts = ptsLabel ?? ptsEntry ?? ptsObj ?? ptsFlat ?? 0;

        const rebLabel = readLabelIndex("REB");
        const rebEntry = tryGet(athleteEntry, ["stats", "REB"]);
        const rebObj = tryGet(athleteObj, ["stats", "REB"]);
        const rebFlat = tryGet(athleteObj, ["reb"]);
        const reb = rebLabel ?? rebEntry ?? rebObj ?? rebFlat ?? 0;

        const astLabel = readLabelIndex("AST");
        const astEntry = tryGet(athleteEntry, ["stats", "AST"]);
        const astObj = tryGet(athleteObj, ["stats", "AST"]);
        const astFlat = tryGet(athleteObj, ["ast"]);
        const ast = astLabel ?? astEntry ?? astObj ?? astFlat ?? 0;

        console.log(
          `[Betslip] PRA debug: ptsLabel=${ptsLabel}, ptsEntry=${ptsEntry}, ptsObj=${ptsObj}, ptsFlat=${ptsFlat}, final pts=${pts}`,
        );
        console.log(
          `[Betslip] PRA debug: rebLabel=${rebLabel}, rebEntry=${rebEntry}, rebObj=${rebObj}, rebFlat=${rebFlat}, final reb=${reb}`,
        );
        console.log(
          `[Betslip] PRA debug: astLabel=${astLabel}, astEntry=${astEntry}, astObj=${astObj}, astFlat=${astFlat}, final ast=${ast}`,
        );
        console.log(
          `[Betslip] PRA calculation: pts=${pts}, reb=${reb}, ast=${ast}, sum=${
            Number(pts) + Number(reb) + Number(ast)
          }`,
        );
        return Number(pts) + Number(reb) + Number(ast);
      }

      // PA = PTS + AST
      if (statUpper === "PA") {
        const pts =
          readLabelIndex("PTS") ??
          tryGet(athleteEntry, ["stats", "PTS"]) ??
          tryGet(athleteObj, ["stats", "PTS"]) ??
          tryGet(athleteObj, ["pts"]) ??
          0;
        const ast =
          readLabelIndex("AST") ??
          tryGet(athleteEntry, ["stats", "AST"]) ??
          tryGet(athleteObj, ["stats", "AST"]) ??
          tryGet(athleteObj, ["ast"]) ??
          0;
        return Number(pts) + Number(ast);
      }

      // PR = PTS + REB
      if (statUpper === "PR") {
        const pts =
          readLabelIndex("PTS") ??
          tryGet(athleteEntry, ["stats", "PTS"]) ??
          tryGet(athleteObj, ["stats", "PTS"]) ??
          tryGet(athleteObj, ["pts"]) ??
          0;
        const reb =
          readLabelIndex("REB") ??
          tryGet(athleteEntry, ["stats", "REB"]) ??
          tryGet(athleteObj, ["stats", "REB"]) ??
          tryGet(athleteObj, ["reb"]) ??
          0;
        return Number(pts) + Number(reb);
      }

      // RA = REB + AST
      if (statUpper === "RA") {
        const reb =
          readLabelIndex("REB") ??
          tryGet(athleteEntry, ["stats", "REB"]) ??
          tryGet(athleteObj, ["stats", "REB"]) ??
          tryGet(athleteObj, ["reb"]) ??
          0;
        const ast =
          readLabelIndex("AST") ??
          tryGet(athleteEntry, ["stats", "AST"]) ??
          tryGet(athleteObj, ["stats", "AST"]) ??
          tryGet(athleteObj, ["ast"]) ??
          0;
        return Number(reb) + Number(ast);
      }

      // 1Q / period-specific stats (NBA stores per-period objects like '1Q')
      if (/^1Q(PTS|AST|REB)$/.test(statUpper)) {
        try {
          const key = statUpper.replace(/^1Q/, "");
          // Try several shapes: athleteEntry['1Q'], athlete.athlete['1Q'], athleteEntry.stats object, or labeled stats array like '1Q PTS'
          const periodObj =
            tryGet(athleteEntry, ["1Q"]) ||
            tryGet(athleteObj, ["1Q"]) ||
            tryGet(athleteEntry, ["athlete", "1Q"]) ||
            tryGet(athleteObj, ["stats", "1Q"]) ||
            tryGet(athleteEntry, ["stats", "1Q"]);
          if (periodObj && typeof periodObj === "object") {
            const val =
              tryGet(periodObj, [key]) ??
              tryGet(periodObj, [key.toUpperCase()]) ??
              tryGet(periodObj, [key.toLowerCase()]);
            console.log(
              `[Betslip] resolvePlayerStatValue 1Q lookup for stat=${statUpper}, athleteId=${
                tryGet(athleteEntry, ["athlete", "id"]) ||
                tryGet(athleteEntry, ["id"])
              }, periodObj=`,
              periodObj,
              "val=",
              val,
            );
            return Number(val) || 0;
          }

          // If stats are in array form with labels, try to find a label like '1Q PTS' or 'Q1 PTS'
          if (Array.isArray(labels) && Array.isArray(athleteEntry.stats)) {
            const re = new RegExp(`(1Q|Q1).*(?:\\s|-|_)?${key}`, "i");
            const idx = labels.findIndex((l) => re.test(String(l || "")));
            if (idx >= 0) return Number(athleteEntry.stats[idx]) || 0;
          }
        } catch (e) {}
        return 0;
      }

      // 3PM / three pointers made: parse "3PT" string like "5-12"
      if (statUpper === "3PM" || statUpper === "3PTM") {
        const raw =
          readLabelIndex("3PT") ||
          tryGet(athleteEntry, ["stats", "3PT"]) ||
          tryGet(athleteObj, ["stats", "3PT"]) ||
          tryGet(athleteObj, ["3pt"]) ||
          null;
        if (raw && String(raw).includes("/")) {
          const nums = String(raw)
            .split(/[-\/]/)
            .map((s) => parseInt(s, 10))
            .filter((n) => !isNaN(n));
          if (nums.length >= 1) return nums[0];
        }
        if (raw && String(raw).includes("-")) {
          const nums = String(raw)
            .split("-")
            .map((s) => parseInt(s, 10))
            .filter((n) => !isNaN(n));
          if (nums.length >= 1) return nums[0];
        }
        return Number(raw) || 0;
      }

      // Steals / Blocks simple lookups
      if (statUpper === "STL" || statUpper === "STEALS")
        return (
          readLabelIndex("STL") ??
          tryGet(athleteEntry, ["stats", "STL"]) ??
          tryGet(athleteObj, ["stats", "STL"]) ??
          tryGet(athleteObj, ["stl"]) ??
          0
        );
      if (statUpper === "BLK" || statUpper === "BLOCKS")
        return (
          readLabelIndex("BLK") ??
          tryGet(athleteEntry, ["stats", "BLK"]) ??
          tryGet(athleteObj, ["stats", "BLK"]) ??
          tryGet(athleteObj, ["blk"]) ??
          0
        );

      // Double-double / Triple-double detection
      if (
        statUpper === "2DBL" ||
        statUpper === "DBL" ||
        statUpper === "DOUBLEDOUBLE"
      ) {
        const pts =
          Number(
            readLabelIndex("PTS") ??
              tryGet(athleteEntry, ["stats", "PTS"]) ??
              tryGet(athleteObj, ["stats", "PTS"]) ??
              0,
          ) || 0;
        const reb =
          Number(
            readLabelIndex("REB") ??
              tryGet(athleteEntry, ["stats", "REB"]) ??
              tryGet(athleteObj, ["stats", "REB"]) ??
              0,
          ) || 0;
        const ast =
          Number(
            readLabelIndex("AST") ??
              tryGet(athleteEntry, ["stats", "AST"]) ??
              tryGet(athleteObj, ["stats", "AST"]) ??
              0,
          ) || 0;
        const stl =
          Number(
            readLabelIndex("STL") ??
              tryGet(athleteEntry, ["stats", "STL"]) ??
              tryGet(athleteObj, ["stats", "STL"]) ??
              0,
          ) || 0;
        const blk =
          Number(
            readLabelIndex("BLK") ??
              tryGet(athleteEntry, ["stats", "BLK"]) ??
              tryGet(athleteObj, ["stats", "BLK"]) ??
              0,
          ) || 0;
        const categories = [pts, reb, ast, stl, blk];
        const count = categories.reduce(
          (c, v) => c + (Number(v) >= 10 ? 1 : 0),
          0,
        );
        return count >= 2 ? 1 : 0;
      }
      if (
        statUpper === "3DBL" ||
        statUpper === "TRIPLEDOUBLE" ||
        statUpper === "TRIPLED"
      ) {
        const pts =
          Number(
            readLabelIndex("PTS") ??
              tryGet(athleteEntry, ["stats", "PTS"]) ??
              tryGet(athleteObj, ["stats", "PTS"]) ??
              0,
          ) || 0;
        const reb =
          Number(
            readLabelIndex("REB") ??
              tryGet(athleteEntry, ["stats", "REB"]) ??
              tryGet(athleteObj, ["stats", "REB"]) ??
              0,
          ) || 0;
        const ast =
          Number(
            readLabelIndex("AST") ??
              tryGet(athleteEntry, ["stats", "AST"]) ??
              tryGet(athleteObj, ["stats", "AST"]) ??
              0,
          ) || 0;
        const stl =
          Number(
            readLabelIndex("STL") ??
              tryGet(athleteEntry, ["stats", "STL"]) ??
              tryGet(athleteObj, ["stats", "STL"]) ??
              0,
          ) || 0;
        const blk =
          Number(
            readLabelIndex("BLK") ??
              tryGet(athleteEntry, ["stats", "BLK"]) ??
              tryGet(athleteObj, ["stats", "BLK"]) ??
              0,
          ) || 0;
        const categories = [pts, reb, ast, stl, blk];
        const count = categories.reduce(
          (c, v) => c + (Number(v) >= 10 ? 1 : 0),
          0,
        );
        return count >= 3 ? 1 : 0;
      }

      // UGL / Goals (common soccer shorthand)
      if (
        statUpper === "UGL" ||
        statUpper === "G" ||
        statUpper === "GOAL" ||
        statUpper === "GOALS"
      ) {
        const v =
          readLabelIndex("G") ??
          readLabelIndex("Gls") ??
          tryGet(athleteObj, ["stats", "G"]) ??
          tryGet(athleteObj, ["goals"]) ??
          tryGet(athleteObj, ["G"]) ??
          0;
        // If no explicit stat, try counting goal-type plays (some summaries record goals in `plays`)
        const parsed = Number(v) || 0;
        if (parsed > 0) return parsed;
        try {
          const plays =
            (athleteEntry && athleteEntry.plays) ||
            (athleteObj && athleteObj.plays) ||
            (athleteEntry &&
              athleteEntry.athlete &&
              athleteEntry.athlete.plays) ||
            [];
          if (Array.isArray(plays) && plays.length) {
            const cnt = plays.reduce((sum, p) => {
              try {
                const s = JSON.stringify(p || "").toLowerCase();
                if (/(\bgoal\b|\bscor(e|ed)\b|penalty goal|\bpen\b)/i.test(s))
                  return sum + 1;
              } catch (e) {}
              return sum;
            }, 0);
            if (cnt > 0) return cnt;
          }
        } catch (e) {}
        return 0;
      }

      if (statUpper === "USOG")
        return (
          readLabelIndex("ST") ?? tryGet(athleteEntry, ["stats", "ST"]) ?? 0
        );

      if (statUpper === "USHT")
        return (
          readLabelIndex("SH") ?? tryGet(athleteEntry, ["stats", "SH"]) ?? 0
        );

      if (statUpper === "USAT")
        return readLabelIndex("A") ?? tryGet(athleteEntry, ["stats", "A"]) ?? 0;

      // Yellow cards (YC)
      if (
        statUpper === "YC" ||
        statUpper === "Y" ||
        statUpper === "YELLOW" ||
        statUpper === "YELLOWCARDS"
      ) {
        const v =
          readLabelIndex("YC") ??
          readLabelIndex("Y") ??
          readLabelIndex("Yellow Cards") ??
          tryGet(athleteObj, ["stats", "YC"]) ??
          tryGet(athleteObj, ["yellowCards"]) ??
          0;
        const parsed = Number(v) || 0;
        if (parsed > 0) return parsed;
        try {
          const plays =
            (athleteEntry && athleteEntry.plays) ||
            (athleteObj && athleteObj.plays) ||
            (athleteEntry &&
              athleteEntry.athlete &&
              athleteEntry.athlete.plays) ||
            [];
          if (Array.isArray(plays) && plays.length) {
            const cnt = plays.reduce((sum, p) => {
              try {
                const s = JSON.stringify(p || "").toLowerCase();
                if (/(yellow card|yellow)/i.test(s)) return sum + 1;
              } catch (e) {}
              return sum;
            }, 0);
            if (cnt > 0) return cnt;
          }
        } catch (e) {}
        return 0;
      }

      // Red cards (RC)
      if (statUpper === "RC" || statUpper === "R" || statUpper === "REDCARDS") {
        const v =
          readLabelIndex("RC") ??
          readLabelIndex("R") ??
          readLabelIndex("Red Cards") ??
          tryGet(athleteObj, ["stats", "RC"]) ??
          tryGet(athleteObj, ["redCards"]) ??
          0;
        const parsed = Number(v) || 0;
        if (parsed > 0) return parsed;
        try {
          const plays =
            (athleteEntry && athleteEntry.plays) ||
            (athleteObj && athleteObj.plays) ||
            (athleteEntry &&
              athleteEntry.athlete &&
              athleteEntry.athlete.plays) ||
            [];
          if (Array.isArray(plays) && plays.length) {
            const cnt = plays.reduce((sum, p) => {
              try {
                const s = JSON.stringify(p || "").toLowerCase();
                if (/(red card|red)/i.test(s)) return sum + 1;
              } catch (e) {}
              return sum;
            }, 0);
            if (cnt > 0) return cnt;
          }
        } catch (e) {}
        return 0;
      }

      // CARD = Yellow + Red
      if (
        statUpper === "CARD" ||
        statUpper === "CARDS" ||
        statUpper === "YCRC" ||
        statUpper === "YC+RC"
      ) {
        const yc =
          readLabelIndex("YC") ??
          readLabelIndex("Y") ??
          tryGet(athleteObj, ["stats", "YC"]) ??
          tryGet(athleteObj, ["yellowCards"]) ??
          0;
        const rc =
          readLabelIndex("RC") ??
          readLabelIndex("R") ??
          tryGet(athleteObj, ["stats", "RC"]) ??
          tryGet(athleteObj, ["redCards"]) ??
          0;
        const parsedYC = Number(yc) || 0;
        const parsedRC = Number(rc) || 0;
        if (parsedYC > 0 || parsedRC > 0) return parsedYC + parsedRC;
        // fallback to plays
        try {
          const plays =
            (athleteEntry && athleteEntry.plays) ||
            (athleteObj && athleteObj.plays) ||
            (athleteEntry &&
              athleteEntry.athlete &&
              athleteEntry.athlete.plays) ||
            [];
          if (Array.isArray(plays) && plays.length) {
            const ycCnt = plays.reduce((sum, p) => {
              try {
                const s = JSON.stringify(p || "").toLowerCase();
                if (/(yellow card|yellow)/i.test(s)) return sum + 1;
              } catch (e) {}
              return sum;
            }, 0);
            const rcCnt = plays.reduce((sum, p) => {
              try {
                const s = JSON.stringify(p || "").toLowerCase();
                if (/(red card|red)/i.test(s)) return sum + 1;
              } catch (e) {}
              return sum;
            }, 0);
            return ycCnt + rcCnt;
          }
        } catch (e) {}
        return 0;
      }

      // Passing yards + rushing yards composite (PRYDS)
      if (statUpper === "PRYDS") {
        const passY =
          tryGet(athleteObj, ["passing", "YDS"]) ||
          tryGet(athleteObj, ["passing", "yds"]) ||
          tryGet(athleteObj, ["stats", "passing", "YDS"]) ||
          tryGet(athleteEntry, ["stats", "passing", "YDS"]) ||
          tryGet(athleteEntry, ["athlete", "stats", "passing", "YDS"]) ||
          null;
        const rushY =
          tryGet(athleteObj, ["rushing", "YDS"]) ||
          tryGet(athleteObj, ["rushing", "yds"]) ||
          tryGet(athleteObj, ["stats", "rushing", "YDS"]) ||
          tryGet(athleteEntry, ["stats", "rushing", "YDS"]) ||
          tryGet(athleteEntry, ["athlete", "stats", "rushing", "YDS"]) ||
          null;
        return (Number(passY) || 0) + (Number(rushY) || 0);
      }

      // PYDS, RYDS, RECYDS individual (nested fallback)
      if (statUpper === "PYDS")
        return (
          readLabelIndex("PYDS") ??
          tryGet(athleteObj, ["passing", "YDS"]) ??
          tryGet(athleteObj, ["passing", "yds"]) ??
          tryGet(athleteEntry, ["stats", "passing", "YDS"]) ??
          tryGet(athleteEntry, ["stats", "passing", "yds"]) ??
          tryGet(athleteEntry, ["athlete", "stats", "passing", "YDS"]) ??
          tryGet(athleteEntry, ["athlete", "stats", "passing", "yds"]) ??
          0
        );
      if (statUpper === "RYDS")
        return (
          readLabelIndex("RYDS") ??
          tryGet(athleteObj, ["rushing", "YDS"]) ??
          tryGet(athleteObj, ["rushing", "yds"]) ??
          tryGet(athleteEntry, ["stats", "rushing", "YDS"]) ??
          tryGet(athleteEntry, ["stats", "rushing", "yds"]) ??
          tryGet(athleteEntry, ["athlete", "stats", "rushing", "YDS"]) ??
          tryGet(athleteEntry, ["athlete", "stats", "rushing", "yds"]) ??
          0
        );
      if (statUpper === "RECYDS")
        return (
          readLabelIndex("RECYDS") ??
          tryGet(athleteObj, ["receiving", "YDS"]) ??
          tryGet(athleteObj, ["receiving", "yds"]) ??
          tryGet(athleteEntry, ["stats", "receiving", "YDS"]) ??
          tryGet(athleteEntry, ["stats", "receiving", "yds"]) ??
          tryGet(athleteEntry, ["athlete", "stats", "receiving", "YDS"]) ??
          tryGet(athleteEntry, ["athlete", "stats", "receiving", "yds"]) ??
          0
        );

      // PINT - passing interceptions
      if (statUpper === "PINT")
        return (
          readLabelIndex("PINT") ??
          readLabelIndex("INT") ??
          tryGet(athleteObj, ["passing", "INT"]) ??
          tryGet(athleteEntry, ["stats", "passing", "INT"]) ??
          tryGet(athleteEntry, ["athlete", "stats", "passing", "INT"]) ??
          0
        );

      // PLNG - passing longest
      if (statUpper === "PLNG")
        return (
          readLabelIndex("PLNG") ??
          tryGet(athleteObj, ["passing", "LONG"]) ??
          tryGet(athleteEntry, ["stats", "passing", "LONG"]) ??
          tryGet(athleteEntry, ["athlete", "stats", "passing", "LONG"]) ??
          0
        );

      // PTD - passing touchdowns
      if (statUpper === "PTD")
        return (
          readLabelIndex("PTD") ??
          readLabelIndex("TD") ??
          tryGet(athleteObj, ["passing", "TD"]) ??
          tryGet(athleteEntry, ["stats", "passing", "TD"]) ??
          tryGet(athleteEntry, ["athlete", "stats", "passing", "TD"]) ??
          0
        );

      // RLNG - rushing longest
      if (statUpper === "RLNG")
        return (
          readLabelIndex("RLNG") ??
          tryGet(athleteObj, ["rushing", "LONG"]) ??
          tryGet(athleteEntry, ["stats", "rushing", "LONG"]) ??
          tryGet(athleteEntry, ["athlete", "stats", "rushing", "LONG"]) ??
          0
        );

      // RREC - receiving receptions
      if (statUpper === "RREC")
        return (
          readLabelIndex("RREC") ??
          readLabelIndex("REC") ??
          tryGet(athleteObj, ["receiving", "REC"]) ??
          tryGet(athleteEntry, ["stats", "receiving", "REC"]) ??
          tryGet(athleteEntry, ["athlete", "stats", "receiving", "REC"]) ??
          0
        );

      // RECLONG - receiving longest reception
      if (statUpper === "RECLONG")
        return (
          readLabelIndex("RECLONG") ??
          tryGet(athleteObj, ["receiving", "LONG"]) ??
          tryGet(athleteEntry, ["stats", "receiving", "LONG"]) ??
          tryGet(athleteEntry, ["athlete", "stats", "receiving", "LONG"]) ??
          0
        );

      // RRYDS - rushing + receiving yards composite
      if (statUpper === "RRYDS") {
        const rushY =
          tryGet(athleteObj, ["rushing", "YDS"]) ||
          tryGet(athleteEntry, ["stats", "rushing", "YDS"]) ||
          tryGet(athleteEntry, ["athlete", "stats", "rushing", "YDS"]) ||
          0;
        const recY =
          tryGet(athleteObj, ["receiving", "YDS"]) ||
          tryGet(athleteEntry, ["stats", "receiving", "YDS"]) ||
          tryGet(athleteEntry, ["athlete", "stats", "receiving", "YDS"]) ||
          0;
        return (Number(rushY) || 0) + (Number(recY) || 0);
      }

      // RATT - rushing attempts/carries
      if (statUpper === "RATT")
        return (
          readLabelIndex("RATT") ??
          readLabelIndex("CAR") ??
          tryGet(athleteObj, ["rushing", "CAR"]) ??
          tryGet(athleteEntry, ["stats", "rushing", "CAR"]) ??
          tryGet(athleteEntry, ["athlete", "stats", "rushing", "CAR"]) ??
          0
        );

      // DSAC - defensive sacks
      if (statUpper === "DSAC")
        return (
          readLabelIndex("DSAC") ??
          readLabelIndex("SACKS") ??
          tryGet(athleteObj, ["defensive", "SACKS"]) ??
          tryGet(athleteEntry, ["stats", "defensive", "SACKS"]) ??
          tryGet(athleteEntry, ["athlete", "stats", "defensive", "SACKS"]) ??
          0
        );

      // DTT - defensive total/combined tackles
      if (statUpper === "DTT")
        return (
          readLabelIndex("DTT") ??
          readLabelIndex("TOT") ??
          readLabelIndex("TOTAL TACKLES") ??
          tryGet(athleteObj, ["defensive", "TOT"]) ??
          tryGet(athleteEntry, ["stats", "defensive", "TOT"]) ??
          tryGet(athleteEntry, ["athlete", "stats", "defensive", "TOT"]) ??
          0
        );

      // DST - defensive solo tackles
      if (statUpper === "DST")
        return (
          readLabelIndex("DST") ??
          readLabelIndex("SOLO") ??
          readLabelIndex("SOLO TACKLES") ??
          tryGet(athleteObj, ["defensive", "SOLO"]) ??
          tryGet(athleteEntry, ["stats", "defensive", "SOLO"]) ??
          tryGet(athleteEntry, ["athlete", "stats", "defensive", "SOLO"]) ??
          0
        );

      // DAT - defensive assisted tackles (calculated as TOT - SOLO)
      if (statUpper === "DAT") {
        const tot =
          readLabelIndex("TOT") ??
          readLabelIndex("TOTAL TACKLES") ??
          tryGet(athleteObj, ["defensive", "TOT"]) ??
          tryGet(athleteEntry, ["stats", "defensive", "TOT"]) ??
          tryGet(athleteEntry, ["athlete", "stats", "defensive", "TOT"]) ??
          0;
        const solo =
          readLabelIndex("SOLO") ??
          readLabelIndex("SOLO TACKLES") ??
          tryGet(athleteObj, ["defensive", "SOLO"]) ??
          tryGet(athleteEntry, ["stats", "defensive", "SOLO"]) ??
          tryGet(athleteEntry, ["athlete", "stats", "defensive", "SOLO"]) ??
          0;
        return Number(tot) - Number(solo);
      }

      // NHL stats (flat stats object, not nested like NFL)
      // HGL - NHL goals
      if (statUpper === "HGL" || statUpper === "GOAL" || statUpper === "GOALS")
        return (
          readLabelIndex("G") ??
          readLabelIndex("GOALS") ??
          tryGet(athleteObj, ["stats", "G"]) ??
          tryGet(athleteObj, ["G"]) ??
          tryGet(athleteEntry, ["stats", "G"]) ??
          tryGet(athleteEntry, ["athlete", "stats", "G"]) ??
          0
        );

      // SHT - NHL shots on goal
      if (statUpper === "SHT" || statUpper === "SOG")
        return (
          readLabelIndex("SOG") ??
          readLabelIndex("SHT") ??
          readLabelIndex("S") ??
          tryGet(athleteEntry, ["stats", "S"]) ??
          tryGet(athleteEntry, ["stats", "SOG"]) ??
          tryGet(athleteObj, ["stats", "SOG"]) ??
          tryGet(athleteObj, ["SOG"]) ??
          tryGet(athleteEntry, ["athlete", "stats", "SOG"]) ??
          0
        );

      // GA - NHL goals + assists composite
      if (statUpper === "GA") {
        const goals =
          tryGet(athleteObj, ["stats", "G"]) ||
          tryGet(athleteEntry, ["stats", "G"]) ||
          tryGet(athleteEntry, ["athlete", "stats", "G"]) ||
          readLabelIndex("G") ||
          0;
        const assists =
          tryGet(athleteObj, ["stats", "A"]) ||
          tryGet(athleteEntry, ["stats", "A"]) ||
          tryGet(athleteEntry, ["athlete", "stats", "A"]) ||
          readLabelIndex("A") ||
          0;
        return (Number(goals) || 0) + (Number(assists) || 0);
      }

      // BS - NHL blocked shots
      if (statUpper === "BS")
        return (
          readLabelIndex("BS") ??
          tryGet(athleteObj, ["stats", "BS"]) ??
          tryGet(athleteObj, ["BS"]) ??
          tryGet(athleteEntry, ["stats", "BS"]) ??
          tryGet(athleteEntry, ["athlete", "stats", "BS"]) ??
          0
        );

      // GSV - NHL goalie saves
      if (statUpper === "GSV")
        return (
          readLabelIndex("SV") ??
          readLabelIndex("GSV") ??
          tryGet(athleteObj, ["stats", "SV"]) ??
          tryGet(athleteObj, ["SV"]) ??
          tryGet(athleteEntry, ["stats", "SV"]) ??
          tryGet(athleteEntry, ["athlete", "stats", "SV"]) ??
          0
        );

      // PCMP / PATT parse strings like "33/44"
      if (statUpper === "PCMP" || statUpper === "PATT") {
        // try label 'Comp/Att' or 'C/ATT'
        const raw =
          readLabelIndex("Comp/Att") ||
          readLabelIndex("C/ATT") ||
          tryGet(athleteObj, ["passing", "C/ATT"]) ||
          tryGet(athleteObj, ["passing", "Comp/Att"]) ||
          tryGet(athleteObj, ["passing", "comp/att"]) ||
          tryGet(athleteObj, ["stats", "Comp/Att"]) ||
          tryGet(athleteEntry, ["stats", "passing", "C/ATT"]) ||
          tryGet(athleteEntry, ["athlete", "stats", "passing", "C/ATT"]);
        const rawStr =
          raw ||
          tryGet(athleteObj, ["passing", "C/ATT"]) ||
          tryGet(athleteObj, ["passing", "comp/att"]) ||
          tryGet(athleteEntry, ["stats", "passing", "C/ATT"]) ||
          tryGet(athleteEntry, ["athlete", "stats", "passing", "C/ATT"]);
        if (rawStr && String(rawStr).includes("/")) {
          const nums = String(rawStr)
            .split("/")
            .map((s) => parseFloat(s))
            .filter((n) => !isNaN(n));
          if (nums.length >= 2) return statUpper === "PCMP" ? nums[0] : nums[1];
        }
        return 0;
      }

      // TDS: sum of rushing.TD + receiving.TD + defensive.TD where available
      if (statUpper === "TDS") {
        const rtd =
          tryGet(athleteObj, ["rushing", "TD"]) ||
          tryGet(athleteObj, ["rushing", "TDs"]) ||
          tryGet(athleteObj, ["rushing", "td"]) ||
          tryGet(athleteEntry, ["stats", "rushing", "TD"]) ||
          tryGet(athleteEntry, ["athlete", "stats", "rushing", "TD"]) ||
          0;
        const recTd =
          tryGet(athleteObj, ["receiving", "TD"]) ||
          tryGet(athleteObj, ["receiving", "td"]) ||
          tryGet(athleteEntry, ["stats", "receiving", "TD"]) ||
          tryGet(athleteEntry, ["athlete", "stats", "receiving", "TD"]) ||
          0;
        const defTd =
          tryGet(athleteObj, ["defensive", "TD"]) ||
          tryGet(athleteObj, ["defensive", "td"]) ||
          tryGet(athleteEntry, ["stats", "defensive", "TD"]) ||
          tryGet(athleteEntry, ["athlete", "stats", "defensive", "TD"]) ||
          0;
        return (Number(rtd) || 0) + (Number(recTd) || 0) + (Number(defTd) || 0);
      }

      // Kicking fields
      if (statUpper === "KXP") {
        // try strings like "1/2"
        const raw =
          tryGet(athleteObj, ["kicking", "XP"]) ||
          tryGet(athleteEntry, ["stats", "kicking", "XP"]) ||
          tryGet(athleteEntry, ["athlete", "stats", "kicking", "XP"]) ||
          readLabelIndex("XP");
        if (raw && String(raw).includes("/")) {
          const nums = String(raw)
            .split("/")
            .map((s) => parseFloat(s))
            .filter((n) => !isNaN(n));
          if (nums.length >= 1) return nums[0];
        }
        return 0;
      }

      // Kicking fields
      if (statUpper === "KFG") {
        // try strings like "1/2"
        const raw =
          tryGet(athleteObj, ["kicking", "FG"]) ||
          tryGet(athleteEntry, ["stats", "kicking", "FG"]) ||
          tryGet(athleteEntry, ["athlete", "stats", "kicking", "FG"]) ||
          readLabelIndex("FG");
        if (raw && String(raw).includes("/")) {
          const nums = String(raw)
            .split("/")
            .map((s) => parseFloat(s))
            .filter((n) => !isNaN(n));
          if (nums.length >= 1) return nums[0];
        }
        return 0;
      }

      if (statUpper === "KPTS")
        return (
          tryGet(athleteObj, ["kicking", "PTS"]) ||
          tryGet(athleteEntry, ["stats", "kicking", "PTS"]) ||
          tryGet(athleteEntry, ["athlete", "stats", "kicking", "PTS"]) ||
          readLabelIndex("PTS") ||
          0
        );

      // Fallback: try to find a label that contains the alias
      if (Array.isArray(labels) && Array.isArray(athleteEntry.stats)) {
        const idx = labels.findIndex((l) =>
          String(l || "")
            .toUpperCase()
            .includes(statUpper),
        );
        if (idx >= 0) return parseFloat(athleteEntry.stats[idx]) || 0;
      }

      // final nested fallbacks by common keys
      const guessMap = {
        PYDS: ["passing", "YDS"],
        RYDS: ["rushing", "YDS"],
        RECYDS: ["receiving", "YDS"],
      };
      if (guessMap[statUpper]) {
        const val = tryGet(athleteObj, guessMap[statUpper]);
        return Number(val) || 0;
      }

      return 0;
    };

    if (!gameId) {
      return res
        .status(400)
        .json({ error: "gameId is required as a query parameter" });
    }

    // Use the gameIdValues array already defined at the start of this endpoint
    // to ensure proper indexing with getParamValueForGame()
    const gameIds = gameIdValues;
    const events = [];

    // Process each game (use index to map per-game query parts)
    for (let gi = 0; gi < gameIds.length; gi++) {
      const rawGameToken = String(gameIds[gi] || "");
      // Support syntax: <eventId> or <eventId>_<sport>
      // If a sport suffix is present and recognized, strip it and use it when selecting ESPN base path.
      // If no suffix provided, default to 'nba' as requested.
      let eventId = rawGameToken;
      let explicitSport = null;
      try {
        const lastUnderscore = rawGameToken.lastIndexOf("_");
        if (lastUnderscore !== -1 && lastUnderscore < rawGameToken.length - 1) {
          const possible = rawGameToken
            .substring(lastUnderscore + 1)
            .toLowerCase();
          const known = Object.keys(ESPN_PATHS || {}).map((k) =>
            String(k).toLowerCase(),
          );
          // also allow common short slugs if not present in ESPN_PATHS
          const extras = [
            "nfl",
            "nba",
            "nhl",
            "mlb",
            "wnba",
            "ncaa",
            "uefa",
            "soccer",
          ];
          const allowed = new Set([...known, ...extras]);
          if (allowed.has(possible)) {
            explicitSport = possible;
            eventId = rawGameToken.substring(0, lastUnderscore);
          }
        }
      } catch (e) {
        /* ignore parsing errors and fall through to defaults */
      }

      if (!explicitSport) explicitSport = "nba"; // default when not provided

      try {
        // For betslip, we need raw ESPN data (not transformed) to get boxscore.players with full structure
        // So we fetch directly from ESPN rather than using the custom API which returns transformed data
        let summaryData = null;
        try {
          // Prefer the sport-specific ESPN path based on explicitSport (parsed or default)
          let baseUrl = ESPN_BASE_URL;
          try {
            const slug = String(explicitSport).toLowerCase();
            if (ESPN_PATHS[slug] && ESPN_PATHS[slug].base)
              baseUrl = ESPN_PATHS[slug].base;
            else if (slug.includes("football"))
              baseUrl = ESPN_PATHS["nfl"].base;
            else if (slug.includes("hockey")) baseUrl = ESPN_PATHS["nhl"].base;
            else if (slug.includes("basketball"))
              baseUrl = ESPN_PATHS["nba"].base;
            else if (slug.includes("soccer")) baseUrl = ESPN_PATHS["uefa"].base;
          } catch (e) {
            /* ignore */
          }

          // Prefer a transformed summary (faster to resolve period/player shapes)
          let usedTransformedSource = false;
          try {
            const transformedCandidates = [
              `http://localhost:${PORT}/api/summary/${explicitSport}/${eventId}`,
              `${PUBLIC_API_URL}/api/summary/${explicitSport}/${eventId}`,
            ];
            for (const tUrl of transformedCandidates) {
              try {
                const tResp = await axios.get(tUrl, { timeout: 2500 });
                if (tResp && tResp.data) {
                  // heuristics: if the returned payload looks transformed (has boxscore.players or firstBasket), prefer it
                  if (tResp.data.boxscore || tResp.data.firstBasket) {
                    summaryData = tResp.data;
                    usedTransformedSource = true;
                    console.log(
                      `[Betslip] Using transformed summary from ${tUrl} for game ${eventId} (token=${rawGameToken})`,
                    );
                    console.log(
                      `[Betslip] Transformed response has boxscore: ${!!summaryData.boxscore}, has boxscore.players: ${!!summaryData
                        .boxscore?.players}`,
                    );
                    break;
                  }
                }
              } catch (innerErr) {
                console.log(
                  `[Betslip] Could not fetch transformed summary from ${tUrl} for ${eventId}: ${
                    innerErr?.message || innerErr
                  }`,
                );
                // try next candidate
              }
            }

            if (!usedTransformedSource) {
              const espnResponse = await axios.get(
                `${baseUrl}/summary?event=${eventId}`,
              );
              summaryData = espnResponse.data;
              console.log(
                `[Betslip] Using ESPN raw data for game ${eventId} (token=${rawGameToken})`,
              );
              console.log(
                `[Betslip] ESPN response has boxscore: ${!!summaryData.boxscore}, has boxscore.players: ${!!summaryData
                  .boxscore?.players}`,
              );
            }
          } catch (espnError) {
            console.log(
              `[Betslip] Failed to fetch from ESPN for game ${eventId} (token=${rawGameToken}): ${espnError.message}`,
            );
          }
        } catch (espnError) {
          console.log(
            `[Betslip] Failed to fetch from ESPN for game ${eventId} (token=${rawGameToken}): ${espnError.message}`,
          );
        }

        if (!summaryData) {
          console.log(`[Betslip] No data available for game ${rawGameToken}`);
          continue;
        }

        // Get game status
        const gameStatus = summaryData.header?.competitions?.[0]?.status?.type;
        const isCompleted = gameStatus?.completed || false;
        const isInProgress = !isCompleted && gameStatus?.state === "in";

        // Helper: Determine if a specific quarter/period/half is currently in progress
        // based on linescore data. This provides granular in-progress detection.
        const isPeriodInProgress = (
          periodIndex,
          linescoresHome,
          linescoresAway,
          gameState,
          completed,
        ) => {
          // If game is completed, no period is in progress
          if (completed) return false;
          // If game hasn't started, nothing is in progress
          if (gameState === "pre") return false;
          // If game state is post, nothing is in progress
          if (gameState === "post") return false;
          // Game must be live ('in' state)
          if (gameState !== "in") return false;

          // Check if the specified period has a score (indicating it's started)
          const periodHasScore =
            (linescoresHome[periodIndex] !== undefined &&
              linescoresHome[periodIndex] !== null) ||
            (linescoresAway[periodIndex] !== undefined &&
              linescoresAway[periodIndex] !== null);
          if (!periodHasScore) return false; // Period hasn't started yet

          // Check if any LATER periods have scores (if so, this period is done)
          const maxPeriod = Math.max(
            ...Object.keys(linescoresHome)
              .map((k) => parseInt(k))
              .filter((n) => !isNaN(n)),
            ...Object.keys(linescoresAway)
              .map((k) => parseInt(k))
              .filter((n) => !isNaN(n)),
          );

          // If there are later periods with scores, this period is completed
          if (maxPeriod > periodIndex) return false;

          // If this is the max period currently being played and game is live, it's in progress
          return true;
        };

        const eventData = {
          eventId: eventId,
          status: {
            shortDetail: gameStatus?.detail,
            completed: isCompleted,
            state: gameStatus?.state,
            date: summaryData.header?.competitions?.[0]?.date || null,
            game: {
              homeTeam:
                summaryData.header?.competitions?.[0]?.competitors?.find(
                  (c) => c.homeAway === "home",
                )?.team?.abbreviation || null,
              awayTeam:
                summaryData.header?.competitions?.[0]?.competitors?.find(
                  (c) => c.homeAway === "away",
                )?.team?.abbreviation || null,
              homeScore:
                summaryData.header?.competitions?.[0]?.competitors?.find(
                  (c) => c.homeAway === "home",
                )?.score || null,
              awayScore:
                summaryData.header?.competitions?.[0]?.competitors?.find(
                  (c) => c.homeAway === "away",
                )?.score || null,
            },
          },
          bets: {},
        };

        // Extract linescores for period checking (needed for 1Q player bets)
        const competitors =
          summaryData.header?.competitions?.[0]?.competitors || [];
        const compHome = competitors.find((c) => c.homeAway === "home") || {};
        const compAway = competitors.find((c) => c.homeAway === "away") || {};
        const linescoresHome = transformLinescores(compHome.linescores || []);
        const linescoresAway = transformLinescores(compAway.linescores || []);

        // Get team logos from boxscore

        // Process moneyline bet. Support per-game mapping when the
        // `moneyline` query param contains comma-separated values.
        const moneylineForThisGame = getParamValueForGame("moneyline", gi);

        // moneylineReg per-game token (use regulation winner across first N periods)
        const moneylineRegForThisGame = getParamValueForGame(
          "moneylineReg",
          gi,
        );

        if (moneylineForThisGame) {
          const competitors =
            summaryData.header?.competitions?.[0]?.competitors || [];

          const betTeam = competitors.find(
            (c) => c.team?.abbreviation === moneylineForThisGame,
          );
          const opposingTeam = competitors.find(
            (c) => c.team?.abbreviation !== moneylineForThisGame,
          );

          if (betTeam && opposingTeam) {
            const betScore = parseInt(betTeam.score) || 0;
            const oppScore = parseInt(opposingTeam.score) || 0;
            const isWinning = betScore > oppScore;
            const isInProgress = !isCompleted && gameStatus?.state === "in";
            // Support draw bets ("X" or "DRAW") in addition to team picks
            const rawML = String(moneylineForThisGame || "").trim();
            const isDrawBet = /^(x|draw)$/i.test(rawML);
            if (isDrawBet) {
              const drawNow = betScore === oppScore;
              eventData.bets.moneyline = {
                team: rawML,
                // store current score for display; won may be overwritten later when moneylineReg is present
                current: {
                  score: `${betScore}-${oppScore}`,
                  lead: drawNow ? "Draw" : "Tied",
                },
                won: isCompleted
                  ? drawNow
                    ? true
                    : false
                  : isInProgress
                    ? "in progress"
                    : "pending",
              };
            } else {
              eventData.bets.moneyline = {
                team: moneylineForThisGame,
                current: {
                  score: `${betScore}-${oppScore}`,
                  lead:
                    betScore > oppScore
                      ? moneylineForThisGame
                      : betScore < oppScore
                        ? opposingTeam.team?.abbreviation
                        : "Tied",
                },
                won: isCompleted
                  ? isWinning
                    ? true
                    : false
                  : isInProgress
                    ? "in progress"
                    : "pending",
              };
            }
          }
        }

        // Determine per-game total and spread tokens (support single-token applied-to-all)
        // Also support `totalPointsNHL` / `totalNHL` as aliases for NHL totals
        const totalNHLToken =
          getParamValueForGame("totalPointsNHL", gi) ||
          getParamValueForGame("totalNHL", gi) ||
          null;
        const totalForThisGame =
          totalNHLToken || getParamValueForGame("total", gi);

        // Process total points bet
        if (totalForThisGame) {
          const competitors =
            summaryData.header?.competitions?.[0]?.competitors || [];
          const homeScore =
            parseInt(competitors.find((c) => c.homeAway === "home")?.score) ||
            0;
          const awayScore =
            parseInt(competitors.find((c) => c.homeAway === "away")?.score) ||
            0;
          const currentTotal = homeScore + awayScore;

          const totalToken = String(totalForThisGame || "").trim();
          // Accept formats: oNNN / uNNN OR NNN+ / NNN- (after number)
          let isOver = false;
          let line = null;
          const mOU = totalToken.match(/^[ou]([0-9.]+)/i);
          const mPlus = totalToken.match(/^([0-9]+(?:\.[0-9]+)?)\+$/);
          const mMinus = totalToken.match(/^([0-9]+(?:\.[0-9]+)?)-$/);
          if (mOU) {
            isOver = /^o/i.test(totalToken);
            line = parseFloat(mOU[1]);
          } else if (mPlus) {
            isOver = true;
            line = parseFloat(mPlus[1]);
          } else if (mMinus) {
            isOver = false;
            line = parseFloat(mMinus[1]);
          } else {
            // fallback: try parse leading numeric
            const num = parseFloat(totalToken.replace(/[^0-9.]/g, ""));
            if (!isNaN(num)) {
              // treat bare number as line for over
              isOver = true;
              line = num;
            }
          }

          if (line !== null) {
            const isInProgress = !isCompleted && gameStatus?.state === "in";
            let won;
            if (isOver) {
              const isWinning = currentTotal >= line;
              won = isCompleted
                ? isWinning
                  ? true
                  : false
                : isInProgress
                  ? isWinning
                    ? true
                    : "in progress"
                  : "pending";
            } else {
              if (isInProgress) {
                const isWinning = currentTotal <= line;
                won = isWinning ? "in progress" : false;
              } else if (!isCompleted) {
                won = "pending";
              } else {
                const isWinning = currentTotal <= line;
                won = isWinning ? true : false;
              }
            }

            eventData.bets.totalPoints = {
              bet: totalForThisGame,
              line: line,
              type: isOver ? "over" : "under",
              current: currentTotal,
              won,
            };
          }
        }

        // Determine per-game spread token (support single-token applied-to-all)
        const spreadForThisGame = getParamValueForGame("spread", gi);

        // Process spread bet
        if (spreadForThisGame) {
          // Accept spread formats like "DEN+1.5", "DEN 1.5", or "DEN-1.5".
          // Express may decode '+' into a space, so normalize by preserving
          // any explicit '+' or interpreting spaces as '+' when appropriate.
          const rawSpread = String(spreadForThisGame || "");
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
              (c) => c.team?.abbreviation === teamAbbr,
            );
            const opposingTeam = competitors.find(
              (c) => c.team?.abbreviation !== teamAbbr,
            );

            if (betTeam && opposingTeam) {
              const betScore = parseInt(betTeam.score) || 0;
              const oppScore = parseInt(opposingTeam.score) || 0;
              const adjustedScore = betScore + spreadLine;
              const isWinning = adjustedScore > oppScore;
              const isInProgress = !isCompleted && gameStatus?.state === "in";

              // compute numeric current as opponent - team (can be negative)
              const currentNumeric = oppScore - betScore;
              eventData.bets.spread = {
                team: teamAbbr,
                // keep numeric line for comparisons and also provide a display string
                line: spreadLine,
                lineDisplay,
                current: currentNumeric,
                // bring won to top-level for easier client consumption
                won: isCompleted
                  ? isWinning
                    ? true
                    : false
                  : isInProgress
                    ? "in progress"
                    : "pending",
              };
            }
          }
        }

        // ---- Additional bet types: team points, quarter/half moneylines/spreads/points, first/last scoring ----
        try {
          // compute some helpful structures
          const competitors =
            summaryData.header?.competitions?.[0]?.competitors || [];
          const compHome = competitors.find((c) => c.homeAway === "home") || {};
          const compAway = competitors.find((c) => c.homeAway === "away") || {};
          const homeAbbr = compHome.team?.abbreviation || null;
          const awayAbbr = compAway.team?.abbreviation || null;

          // helper to read linescores (period -> value)
          const homeLines = transformLinescores(compHome.linescores || []);
          const awayLines = transformLinescores(compAway.linescores || []);

          // If moneylineReg was requested for this game, compute regulation winner
          // (first 4 periods for sports with >=4 periods, else first 2 halves).
          try {
            if (
              typeof moneylineRegForThisGame !== "undefined" &&
              moneylineRegForThisGame !== null
            ) {
              // determine how many periods to count
              const homePeriods = Object.keys(homeLines || {})
                .filter((k) => !isNaN(Number(k)))
                .map(Number)
                .sort((a, b) => a - b);
              const awayPeriods = Object.keys(awayLines || {})
                .filter((k) => !isNaN(Number(k)))
                .map(Number)
                .sort((a, b) => a - b);
              const maxPeriods = Math.max(
                homePeriods.length,
                awayPeriods.length,
              );
              // NBA: 4 periods, NHL: 3 periods, UEFA/Soccer: 2 periods
              const regCount =
                maxPeriods >= 4
                  ? 4
                  : maxPeriods >= 3
                    ? 3
                    : maxPeriods >= 2
                      ? 2
                      : maxPeriods;

              // Always process moneylineReg bet, even pre-game (regCount may be 0)
              let homeReg = 0;
              let awayReg = 0;
              for (let p = 1; p <= regCount; p++) {
                homeReg += Number(homeLines[p] || 0);
                awayReg += Number(awayLines[p] || 0);
              }
              const regWinner =
                homeReg > awayReg
                  ? homeAbbr
                  : awayReg > homeReg
                    ? awayAbbr
                    : "Draw";

              const rawReg = String(moneylineRegForThisGame).trim();
              const isDrawReg = /^(x|draw)$/i.test(rawReg);
              const betTarget = isDrawReg ? "Draw" : rawReg.toUpperCase();
              const won = isCompleted
                ? betTarget === regWinner
                  ? true
                  : false
                : isInProgress
                  ? "in progress"
                  : "pending";

              // Create or update moneyline bet with regulation data
              if (!eventData.bets.moneyline) {
                // Create new moneyline bet for regulation-only bets
                const homeScore = parseInt(compHome?.score) || 0;
                const awayScore = parseInt(compAway?.score) || 0;

                eventData.bets.moneyline = {
                  team: moneylineRegForThisGame,
                  current: {
                    score: `${homeScore}-${awayScore}`,
                    lead:
                      homeScore > awayScore
                        ? homeAbbr
                        : awayScore > homeScore
                          ? awayAbbr
                          : "Tied",
                  },
                  won: won,
                  reg: {
                    request: moneylineRegForThisGame,
                    homeReg,
                    awayReg,
                    regWinner,
                    countedPeriods: regCount,
                  },
                };
              } else {
                // attach regulation summary and final won status to existing moneyline
                eventData.bets.moneyline.reg = {
                  request: moneylineRegForThisGame,
                  homeReg,
                  awayReg,
                  regWinner,
                  countedPeriods: regCount,
                };
                eventData.bets.moneyline.won = won;
              }
            }
          } catch (e) {
            /* ignore */
          }

          // Full game team points: homePoints and awayPoints (or homeGoals/awayGoals for NHL)
          const homePointsToken =
            getParamValueForGame("homePoints", gi) ||
            getParamValueForGame("homeGoals", gi);
          const awayPointsToken =
            getParamValueForGame("awayPoints", gi) ||
            getParamValueForGame("awayGoals", gi);
          const homeScore = parseInt(compHome.score) || 0;
          const awayScore = parseInt(compAway.score) || 0;

          const processTeamPoints = (token, score, keyName) => {
            if (!token) return;
            const tkn = String(token).trim().replace(/\s+/g, "");
            let isOver = false;
            let line = null;
            const mOU = tkn.match(/^[ou]([0-9.]+)/i);
            const mPlus = tkn.match(/^([0-9]+(?:\.[0-9]+)?)\+$/);
            const mMinus = tkn.match(/^([0-9]+(?:\.[0-9]+)?)-$/);
            // Also try matching if + was URL-decoded to space: "120.5 "
            const mPlusSpace =
              !mPlus &&
              String(token)
                .trim()
                .match(/^([0-9]+(?:\.[0-9]+)?)\s*$/);
            if (mOU) {
              isOver = /^o/i.test(tkn);
              line = parseFloat(mOU[1]);
            } else if (mPlus) {
              isOver = true;
              line = parseFloat(mPlus[1]);
            } else if (mMinus) {
              isOver = false;
              line = parseFloat(mMinus[1]);
            } else if (mPlusSpace) {
              // + was decoded as space, treat as over
              isOver = true;
              line = parseFloat(mPlusSpace[1]);
            }
            if (line !== null) {
              let won;
              if (isOver) {
                const isWinning = score >= line;
                won = isCompleted
                  ? isWinning
                    ? true
                    : false
                  : isInProgress
                    ? isWinning
                      ? true
                      : "in progress"
                    : "pending";
              } else {
                const isWinning = score <= line;
                if (isInProgress) won = isWinning ? "in progress" : false;
                else if (!isCompleted) won = "pending";
                else won = isWinning ? true : false;
              }
              eventData.bets[keyName] = {
                bet: token,
                line,
                current: score,
                type: isOver ? "over" : "under",
                won,
              };
            }
          };
          processTeamPoints(homePointsToken, homeScore, "homePoints");
          processTeamPoints(awayPointsToken, awayScore, "awayPoints");

          // helper: parse per-game param
          const pointsToken = getParamValueForGame("points", gi);
          if (pointsToken) {
            // format: <TEAM><o|u><line>, e.g. TBo23.5
            const m = String(pointsToken).match(
              /^([A-Z]{1,5})([ouOU])([0-9.]+)$/i,
            );
            if (m) {
              const teamAbbr = m[1].toUpperCase();
              const isOver = m[2].toLowerCase() === "o";
              const line = parseFloat(m[3]);
              const teamCompetitor = competitors.find(
                (c) => c.team?.abbreviation === teamAbbr,
              );
              const current = parseInt(teamCompetitor?.score) || 0;
              const isInProgress = !isCompleted && gameStatus?.state === "in";
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
                if (isInProgress) {
                  won = current <= line ? "in progress" : false;
                } else if (!isCompleted) {
                  won = "pending";
                } else {
                  const isWinning = current <= line;
                  won = isWinning ? true : false;
                }
              }
              eventData.bets.teamPoints = eventData.bets.teamPoints || [];
              eventData.bets.teamPoints.push({
                team: teamAbbr,
                bet: pointsToken,
                current,
                line,
                type: isOver ? "over" : "under",
                won,
              });
            }
          }

          // Quarter and half moneyline/spread/points
          const quarterNames = ["1st", "2nd", "3rd", "4th"];
          const halfNames = ["1stH", "2ndH"];

          // iterate quarters
          for (let qi = 0; qi < quarterNames.length; qi++) {
            const period = qi + 1;
            const qKeyNum = `${period}ML`;
            const qKeyNamed = `${quarterNames[qi]}ML`;
            const qKeyQ = `Q${period}ML`;
            const qKeyAlt = `moneyline${period}Q`;
            const qVal =
              getParamValueForGame(qKeyNum, gi) ||
              getParamValueForGame(qKeyNamed, gi) ||
              getParamValueForGame(qKeyQ, gi) ||
              getParamValueForGame(qKeyAlt, gi);
            if (qVal) {
              // qVal expected as team abbr
              const homeQ = parseInt(homeLines[period]) || 0;
              const awayQ = parseInt(awayLines[period]) || 0;
              const winner =
                homeQ > awayQ ? homeAbbr : awayQ > homeQ ? awayAbbr : "Tied";
              const quarterInProgress = isPeriodInProgress(
                period,
                homeLines,
                awayLines,
                gameStatus?.state,
                isCompleted,
              );
              eventData.bets[`Q${period}_ML`] = {
                bet: qVal,
                current: `${homeQ}-${awayQ}`,
                won: qVal === winner ? (isCompleted ? true : "pending") : false,
              };
            }

            // quarter spread (accept numeric, named or Q-prefixed keys)
            const qSpKeyNum = `${period}SP`;
            const qSpKeyNamed = `${quarterNames[qi]}SP`;
            const qSpKeyQ = `Q${period}SP`;
            const qSpKeyAlt = `spread${period}Q`;
            const qSpVal =
              getParamValueForGame(qSpKeyNum, gi) ||
              getParamValueForGame(qSpKeyNamed, gi) ||
              getParamValueForGame(qSpKeyQ, gi) ||
              getParamValueForGame(qSpKeyAlt, gi);
            if (qSpVal) {
              // format similar to spread: "TB+1.5" or "TB-1.5" or "TB 1.5"
              const match = String(qSpVal).match(
                /^([A-Z]+)[+\s]?([+-]?[0-9.]+)$/i,
              );
              if (match) {
                const teamAbbr = match[1].toUpperCase();
                const spreadLine = parseFloat(match[2]);
                const homeQ = parseInt(homeLines[period]) || 0;
                const awayQ = parseInt(awayLines[period]) || 0;
                const betTeamScore = teamAbbr === homeAbbr ? homeQ : awayQ;
                const oppScore = teamAbbr === homeAbbr ? awayQ : homeQ;
                const adjusted = betTeamScore + spreadLine;
                const isWinning = adjusted > oppScore;
                const quarterInProgress = isPeriodInProgress(
                  period,
                  homeLines,
                  awayLines,
                  gameStatus?.state,
                  isCompleted,
                );
                // numeric current: opponent - team
                const qCurrentNumeric =
                  teamAbbr === homeAbbr ? awayQ - homeQ : homeQ - awayQ;
                eventData.bets[`Q${period}_SP`] = {
                  team: teamAbbr,
                  line: spreadLine,
                  current: qCurrentNumeric,
                  won: isCompleted ? (isWinning ? true : false) : "pending",
                };
              }
            }

            // Quarter total
            const qTotalKey = `total${period}Q`;
            const qTotalAlt = `Q${period}T`;
            const qTotalVal =
              getParamValueForGame(qTotalKey, gi) ||
              getParamValueForGame(qTotalAlt, gi);
            if (qTotalVal) {
              const tkn = String(qTotalVal).trim().replace(/\s+/g, "");
              let isOver = false;
              let line = null;
              const mOU = tkn.match(/^[ou]([0-9.]+)/i);
              const mPlus = tkn.match(/^([0-9]+(?:\.[0-9]+)?)\+$/);
              const mMinus = tkn.match(/^([0-9]+(?:\.[0-9]+)?)-$/);
              const mPlusSpace =
                !mPlus &&
                String(qTotalVal)
                  .trim()
                  .match(/^([0-9]+(?:\.[0-9]+)?)\s*$/);
              if (mOU) {
                isOver = /^o/i.test(tkn);
                line = parseFloat(mOU[1]);
              } else if (mPlus) {
                isOver = true;
                line = parseFloat(mPlus[1]);
              } else if (mMinus) {
                isOver = false;
                line = parseFloat(mMinus[1]);
              } else if (mPlusSpace) {
                isOver = true;
                line = parseFloat(mPlusSpace[1]);
              }
              if (line !== null) {
                const homeQ = parseInt(homeLines[period]) || 0;
                const awayQ = parseInt(awayLines[period]) || 0;
                const currentQTotal = homeQ + awayQ;
                const quarterInProgress = isPeriodInProgress(
                  period,
                  homeLines,
                  awayLines,
                  gameStatus?.state,
                  isCompleted,
                );
                let won;
                if (isOver) {
                  const isWinning = currentQTotal >= line;
                  won = isCompleted ? (isWinning ? true : false) : "pending";
                } else {
                  const isWinning = currentQTotal <= line;
                  won = isCompleted ? (isWinning ? true : false) : "pending";
                }
                eventData.bets[`Q${period}_T`] = {
                  bet: qTotalVal,
                  line,
                  type: isOver ? "over" : "under",
                  current: currentQTotal,
                  won,
                };
              }
            }

            // Quarter team points: homePoints1Q, awayPoints1Q (or homeGoals/awayGoals for NHL)
            const qHomePointsKey = `homePoints${period}Q`;
            const qAwayPointsKey = `awayPoints${period}Q`;
            const qHomeGoalsKey = `homeGoals${period}Q`;
            const qAwayGoalsKey = `awayGoals${period}Q`;
            const qPtKeyNum = `${period}QTP`;
            const qPtKeyNamed = `${quarterNames[qi]}QTP`;
            const qPtKeyQ = `Q${period}TP`;
            const qHomePointsVal =
              getParamValueForGame(qHomePointsKey, gi) ||
              getParamValueForGame(qHomeGoalsKey, gi);
            const qAwayPointsVal =
              getParamValueForGame(qAwayPointsKey, gi) ||
              getParamValueForGame(qAwayGoalsKey, gi);
            const qPtVal =
              getParamValueForGame(qPtKeyNum, gi) ||
              getParamValueForGame(qPtKeyNamed, gi) ||
              getParamValueForGame(qPtKeyQ, gi);
            // Process homePoints1Q / awayPoints1Q
            const processQuarterTeamPoints = (token, teamSide, keyName) => {
              if (!token) return;
              const tkn = String(token).trim().replace(/\s+/g, "");
              let isOver = false;
              let line = null;
              const mOU = tkn.match(/^[ou]([0-9.]+)/i);
              const mPlus = tkn.match(/^([0-9]+(?:\.[0-9]+)?)\+$/);
              const mMinus = tkn.match(/^([0-9]+(?:\.[0-9]+)?)-$/);
              const mPlusSpace =
                !mPlus &&
                String(token)
                  .trim()
                  .match(/^([0-9]+(?:\.[0-9]+)?)\s*$/);
              if (mOU) {
                isOver = /^o/i.test(tkn);
                line = parseFloat(mOU[1]);
              } else if (mPlus) {
                isOver = true;
                line = parseFloat(mPlus[1]);
              } else if (mMinus) {
                isOver = false;
                line = parseFloat(mMinus[1]);
              } else if (mPlusSpace) {
                isOver = true;
                line = parseFloat(mPlusSpace[1]);
              }
              if (line !== null) {
                const homeQ = parseInt(homeLines[period]) || 0;
                const awayQ = parseInt(awayLines[period]) || 0;
                const current = teamSide === "home" ? homeQ : awayQ;
                const quarterInProgress = isPeriodInProgress(
                  period,
                  homeLines,
                  awayLines,
                  gameStatus?.state,
                  isCompleted,
                );
                let won;
                const isWinning = isOver ? current >= line : current <= line;
                won = isCompleted ? (isWinning ? true : false) : "pending";
                eventData.bets[keyName] = {
                  bet: token,
                  line,
                  current,
                  type: isOver ? "over" : "under",
                  won,
                };
              }
            };
            processQuarterTeamPoints(
              qHomePointsVal,
              "home",
              `homePoints${period}Q`,
            );
            processQuarterTeamPoints(
              qAwayPointsVal,
              "away",
              `awayPoints${period}Q`,
            );

            // Legacy format: 1QTP=TBo23.5
            if (qPtVal) {
              const m = String(qPtVal).match(
                /^([A-Z]{1,5})([ouOU])([0-9.]+)$/i,
              );
              if (m) {
                const teamAbbr = m[1].toUpperCase();
                const isOver = m[2].toLowerCase() === "o";
                const line = parseFloat(m[3]);
                const current =
                  teamAbbr === homeAbbr
                    ? parseInt(homeLines[period]) || 0
                    : parseInt(awayLines[period]) || 0;
                const quarterInProgress = isPeriodInProgress(
                  period,
                  homeLines,
                  awayLines,
                  gameStatus?.state,
                  isCompleted,
                );
                let won;
                if (isOver) {
                  const isWinning = current >= line;
                  won = isCompleted
                    ? isWinning
                      ? true
                      : false
                    : quarterInProgress
                      ? "in progress"
                      : "pending";
                } else {
                  if (quarterInProgress) {
                    won = current <= line ? "in progress" : false;
                  } else if (!isCompleted) {
                    won = "pending";
                  } else {
                    const isWinning = current <= line;
                    won = isWinning ? true : false;
                  }
                }
                eventData.bets[`Q${period}_TP`] =
                  eventData.bets[`Q${period}_TP`] || [];
                eventData.bets[`Q${period}_TP`].push({
                  team: teamAbbr,
                  bet: qPtVal,
                  current,
                  line,
                  type: isOver ? "over" : "under",
                  won,
                });
              }
            }
          }

          // NHL Periods: moneyline1P, spread1P, total1P (for period 1, 2, 3, etc.)
          for (let pi = 1; pi <= 3; pi++) {
            const periodMLKey = `moneyline${pi}P`;
            const periodSPKey = `spread${pi}P`;
            const periodTKey = `total${pi}P`;

            const periodMLVal = getParamValueForGame(periodMLKey, gi);
            const periodSPVal = getParamValueForGame(periodSPKey, gi);
            const periodTVal = getParamValueForGame(periodTKey, gi);

            const homePeriod = parseInt(homeLines[pi]) || 0;
            const awayPeriod = parseInt(awayLines[pi]) || 0;

            // Period moneyline
            if (periodMLVal) {
              const winner =
                homePeriod > awayPeriod
                  ? homeAbbr
                  : awayPeriod > homePeriod
                    ? awayAbbr
                    : "Tied";
              const periodInProgress = isPeriodInProgress(
                pi,
                homeLines,
                awayLines,
                gameStatus?.state,
                isCompleted,
              );
              eventData.bets[`P${pi}_ML`] = {
                bet: periodMLVal,
                current: `${homePeriod}-${awayPeriod}`,
                won:
                  periodMLVal === winner
                    ? isCompleted
                      ? true
                      : periodInProgress
                        ? "in progress"
                        : "pending"
                    : false,
              };
            }

            // Period spread
            if (periodSPVal) {
              const match = String(periodSPVal).match(
                /^([A-Z]+)[+\s]?([+-]?[0-9.]+)$/i,
              );
              if (match) {
                const teamAbbr = match[1].toUpperCase();
                const spreadLine = parseFloat(match[2]);
                const betTeamScore =
                  teamAbbr === homeAbbr ? homePeriod : awayPeriod;
                const oppScore =
                  teamAbbr === homeAbbr ? awayPeriod : homePeriod;
                const adjusted = betTeamScore + spreadLine;
                const isWinning = adjusted > oppScore;
                const periodInProgress = isPeriodInProgress(
                  pi,
                  homeLines,
                  awayLines,
                  gameStatus?.state,
                  isCompleted,
                );
                // numeric current for period spread: opponent - team
                const pCurrentNumeric =
                  teamAbbr === homeAbbr
                    ? awayPeriod - homePeriod
                    : homePeriod - awayPeriod;
                eventData.bets[`P${pi}_SP`] = {
                  team: teamAbbr,
                  line: spreadLine,
                  current: pCurrentNumeric,
                  won: isCompleted
                    ? isWinning
                      ? true
                      : false
                    : periodInProgress
                      ? "in progress"
                      : isWinning
                        ? true
                        : false, // Period complete, evaluate result
                };
              }
            }

            // Period total
            if (periodTVal) {
              const tkn = String(periodTVal).trim().replace(/\s+/g, "");
              let isOver = false;
              let line = null;
              const mOU = tkn.match(/^[ou]([0-9.]+)/i);
              const mPlus = tkn.match(/^([0-9]+(?:\.[0-9]+)?)\+$/);
              const mMinus = tkn.match(/^([0-9]+(?:\.[0-9]+)?)-$/);
              const mPlusSpace =
                !mPlus &&
                String(periodTVal)
                  .trim()
                  .match(/^([0-9]+(?:\.[0-9]+)?)\s*$/);
              if (mOU) {
                isOver = /^o/i.test(tkn);
                line = parseFloat(mOU[1]);
              } else if (mPlus) {
                isOver = true;
                line = parseFloat(mPlus[1]);
              } else if (mMinus) {
                isOver = false;
                line = parseFloat(mMinus[1]);
              } else if (mPlusSpace) {
                isOver = true;
                line = parseFloat(mPlusSpace[1]);
              }
              if (line !== null) {
                const currentPTotal = homePeriod + awayPeriod;
                const periodInProgress = isPeriodInProgress(
                  pi,
                  homeLines,
                  awayLines,
                  gameStatus?.state,
                  isCompleted,
                );
                let won;
                const isWinning = isOver
                  ? currentPTotal >= line
                  : currentPTotal <= line;
                won = isCompleted ? (isWinning ? true : false) : "pending";
                eventData.bets[`P${pi}_T`] = {
                  bet: periodTVal,
                  line,
                  type: isOver ? "over" : "under",
                  current: currentPTotal,
                  won,
                };
              }
            }

            // Period team points/goals: homeGoals1P, awayGoals1P, homePoints1P, awayPoints1P
            const periodHomePointsKey = `homePoints${pi}P`;
            const periodAwayPointsKey = `awayPoints${pi}P`;
            const periodHomeGoalsKey = `homeGoals${pi}P`;
            const periodAwayGoalsKey = `awayGoals${pi}P`;
            const periodHomeVal =
              getParamValueForGame(periodHomePointsKey, gi) ||
              getParamValueForGame(periodHomeGoalsKey, gi);
            const periodAwayVal =
              getParamValueForGame(periodAwayPointsKey, gi) ||
              getParamValueForGame(periodAwayGoalsKey, gi);

            const processPeriodTeamPoints = (token, score, keyName) => {
              if (!token) return;
              const tkn = String(token).trim().replace(/\s+/g, "");
              let isOver = false;
              let line = null;
              const mOU = tkn.match(/^[ou]([0-9.]+)/i);
              const mPlus = tkn.match(/^([0-9]+(?:\.[0-9]+)?)\+$/);
              const mMinus = tkn.match(/^([0-9]+(?:\.[0-9]+)?)-$/);
              const mPlusSpace =
                !mPlus &&
                String(token)
                  .trim()
                  .match(/^([0-9]+(?:\.[0-9]+)?)\s*$/);
              if (mOU) {
                isOver = /^o/i.test(tkn);
                line = parseFloat(mOU[1]);
              } else if (mPlus) {
                isOver = true;
                line = parseFloat(mPlus[1]);
              } else if (mMinus) {
                isOver = false;
                line = parseFloat(mMinus[1]);
              } else if (mPlusSpace) {
                isOver = true;
                line = parseFloat(mPlusSpace[1]);
              }
              if (line !== null) {
                const periodInProgress = isPeriodInProgress(
                  pi,
                  homeLines,
                  awayLines,
                  gameStatus?.state,
                  isCompleted,
                );
                let won;
                const isWinning = isOver ? score >= line : score <= line;
                won = isCompleted ? (isWinning ? true : false) : "pending";
                eventData.bets[keyName] = {
                  bet: token,
                  line,
                  current: score,
                  type: isOver ? "over" : "under",
                  won,
                };
              }
            };
            processPeriodTeamPoints(
              periodHomeVal,
              homePeriod,
              `homePoints${pi}P`,
            );
            processPeriodTeamPoints(
              periodAwayVal,
              awayPeriod,
              `awayPoints${pi}P`,
            );
          }

          // halves: use first two periods for first half, last two for second half
          for (let hi = 0; hi < 2; hi++) {
            const halfIndex = hi + 1; // 1 or 2
            const halfMLKey = `${halfIndex}HML`;
            const halfMLAlt = `${halfIndex}ML`; // accept variant like 1stML for halves too if provided
            // also accept query params like moneyline1H / moneyline2H
            const halfMLVal =
              getParamValueForGame(halfMLKey, gi) ||
              getParamValueForGame(halfMLAlt, gi) ||
              getParamValueForGame(`moneyline${halfIndex}H`, gi) ||
              getParamValueForGame(`moneyline${halfIndex}`, gi);
            const periods = hi === 0 ? [1, 2] : [3, 4];
            // Determine whether linescores represent a 2-period game (e.g., soccer halves)
            const maxPeriods = Math.max(
              Object.keys(homeLines || {}).length,
              Object.keys(awayLines || {}).length,
            );
            let homeHalf = 0;
            let awayHalf = 0;
            if (maxPeriods <= 2) {
              // For 2-period games use the period matching the half index (1 or 2)
              const periodKey = halfIndex; // 1 => first period, 2 => second period
              homeHalf = parseInt(homeLines[periodKey] || 0) || 0;
              awayHalf = parseInt(awayLines[periodKey] || 0) || 0;
            } else {
              homeHalf =
                (parseInt(homeLines[periods[0]] || 0) || 0) +
                (parseInt(homeLines[periods[1]] || 0) || 0);
              awayHalf =
                (parseInt(awayLines[periods[0]] || 0) || 0) +
                (parseInt(awayLines[periods[1]] || 0) || 0);
            }
            if (halfMLVal) {
              const winner =
                homeHalf > awayHalf
                  ? homeAbbr
                  : awayHalf > homeHalf
                    ? awayAbbr
                    : "Tied";
              // For halves in 2-period games, check if that specific period is active
              // For halves in 4-period games, check if either of the two quarters is active
              let halfInProgress = false;
              if (maxPeriods <= 2) {
                halfInProgress = isPeriodInProgress(
                  halfIndex,
                  homeLines,
                  awayLines,
                  gameStatus?.state,
                  isCompleted,
                );
              } else {
                // Check if either of the two periods making up this half is in progress
                halfInProgress = periods.some((p) =>
                  isPeriodInProgress(
                    p,
                    homeLines,
                    awayLines,
                    gameStatus?.state,
                    isCompleted,
                  ),
                );
              }
              eventData.bets[`H${halfIndex}_ML`] = {
                bet: halfMLVal,
                current: `${homeHalf}-${awayHalf}`,
                won:
                  halfMLVal === winner
                    ? isCompleted
                      ? true
                      : "pending"
                    : false,
              };
            }

            // Half total
            const halfTotalKey = `total${halfIndex}H`;
            const halfTotalAlt = `H${halfIndex}_T`;
            const halfTotalVal =
              getParamValueForGame(halfTotalKey, gi) ||
              getParamValueForGame(halfTotalAlt, gi);
            if (halfTotalVal) {
              const tkn = String(halfTotalVal).trim().replace(/\s+/g, "");
              let isOver = false;
              let line = null;
              const mOU = tkn.match(/^[ou]([0-9.]+)/i);
              const mPlus = tkn.match(/^([0-9]+(?:\.[0-9]+)?)\+$/);
              const mMinus = tkn.match(/^([0-9]+(?:\.[0-9]+)?)-$/);
              const mPlusSpace =
                !mPlus &&
                String(halfTotalVal)
                  .trim()
                  .match(/^([0-9]+(?:\.[0-9]+)?)\s*$/);
              if (mOU) {
                isOver = /^o/i.test(tkn);
                line = parseFloat(mOU[1]);
              } else if (mPlus) {
                isOver = true;
                line = parseFloat(mPlus[1]);
              } else if (mMinus) {
                isOver = false;
                line = parseFloat(mMinus[1]);
              } else if (mPlusSpace) {
                isOver = true;
                line = parseFloat(mPlusSpace[1]);
              }
              if (line !== null) {
                const currentHalfTotal = homeHalf + awayHalf;
                // Check if any periods in this half are in progress
                let halfInProgress = false;
                if (maxPeriods <= 2) {
                  halfInProgress = isPeriodInProgress(
                    halfIndex,
                    homeLines,
                    awayLines,
                    gameStatus?.state,
                    isCompleted,
                  );
                } else {
                  halfInProgress = periods.some((p) =>
                    isPeriodInProgress(
                      p,
                      homeLines,
                      awayLines,
                      gameStatus?.state,
                      isCompleted,
                    ),
                  );
                }
                let won;
                const isWinning = isOver
                  ? currentHalfTotal >= line
                  : currentHalfTotal <= line;
                won = isCompleted ? (isWinning ? true : false) : "pending";
                eventData.bets[`H${halfIndex}_T`] = {
                  bet: halfTotalVal,
                  line,
                  type: isOver ? "over" : "under",
                  current: currentHalfTotal,
                  won,
                };
              }
            }

            // Half spread
            const halfSPKey = `spread${halfIndex}H`;
            const halfSPAlt = `${halfIndex}HSP`;
            const halfSPVal = getParamValueForGame(halfSPKey, gi);
            if (halfSPVal) {
              const match = String(halfSPVal).match(
                /^([A-Z]+)[+\s]?([+-]?[0-9.]+)$/i,
              );
              if (match) {
                const teamAbbr = match[1].toUpperCase();
                const spreadLine = parseFloat(match[2]);
                // reuse computed half values
                // homeHalf and awayHalf already defined above
                const betTeamScore =
                  teamAbbr === homeAbbr ? homeHalf : awayHalf;
                const oppScore = teamAbbr === homeAbbr ? awayHalf : homeHalf;
                const adjusted = betTeamScore + spreadLine;
                const isWinning = adjusted > oppScore;
                // Check if any periods in this half are in progress
                let halfInProgress = false;
                if (maxPeriods <= 2) {
                  halfInProgress = isPeriodInProgress(
                    halfIndex,
                    homeLines,
                    awayLines,
                    gameStatus?.state,
                    isCompleted,
                  );
                } else {
                  halfInProgress = periods.some((p) =>
                    isPeriodInProgress(
                      p,
                      homeLines,
                      awayLines,
                      gameStatus?.state,
                      isCompleted,
                    ),
                  );
                }
                const hCurrentNumeric =
                  teamAbbr === homeAbbr
                    ? awayHalf - homeHalf
                    : homeHalf - awayHalf;
                eventData.bets[`H${halfIndex}_SP`] = {
                  team: teamAbbr,
                  line: spreadLine,
                  current: hCurrentNumeric,
                  won: isCompleted ? (isWinning ? true : false) : "pending",
                };
              }
            }

            // half team points tokens: 1stHTP, 2ndHTP (or homeGoals/awayGoals for NHL)
            const halfTPKey = `${halfIndex}HTP`;
            const halfHomePointsKey = `homePoints${halfIndex}H`;
            const halfAwayPointsKey = `awayPoints${halfIndex}H`;
            const halfHomeGoalsKey = `homeGoals${halfIndex}H`;
            const halfAwayGoalsKey = `awayGoals${halfIndex}H`;
            const halfHomePointsVal =
              getParamValueForGame(halfHomePointsKey, gi) ||
              getParamValueForGame(halfHomeGoalsKey, gi);
            const halfAwayPointsVal =
              getParamValueForGame(halfAwayPointsKey, gi) ||
              getParamValueForGame(halfAwayGoalsKey, gi);
            const halfTPVal = getParamValueForGame(halfTPKey, gi);

            // Process homePoints1H / awayPoints1H
            const processHalfTeamPoints = (token, teamSide, keyName) => {
              if (!token) return;
              const tkn = String(token).trim().replace(/\s+/g, "");
              let isOver = false;
              let line = null;
              const mOU = tkn.match(/^[ou]([0-9.]+)/i);
              const mPlus = tkn.match(/^([0-9]+(?:\.[0-9]+)?)\+$/);
              const mMinus = tkn.match(/^([0-9]+(?:\.[0-9]+)?)-$/);
              const mPlusSpace =
                !mPlus &&
                String(token)
                  .trim()
                  .match(/^([0-9]+(?:\.[0-9]+)?)\s*$/);
              if (mOU) {
                isOver = /^o/i.test(tkn);
                line = parseFloat(mOU[1]);
              } else if (mPlus) {
                isOver = true;
                line = parseFloat(mPlus[1]);
              } else if (mMinus) {
                isOver = false;
                line = parseFloat(mMinus[1]);
              } else if (mPlusSpace) {
                isOver = true;
                line = parseFloat(mPlusSpace[1]);
              }
              if (line !== null) {
                const current = teamSide === "home" ? homeHalf : awayHalf;
                // Check if any periods in this half are in progress
                let halfInProgress = false;
                if (maxPeriods <= 2) {
                  halfInProgress = isPeriodInProgress(
                    halfIndex,
                    homeLines,
                    awayLines,
                    gameStatus?.state,
                    isCompleted,
                  );
                } else {
                  halfInProgress = periods.some((p) =>
                    isPeriodInProgress(
                      p,
                      homeLines,
                      awayLines,
                      gameStatus?.state,
                      isCompleted,
                    ),
                  );
                }
                let won;
                if (isOver) {
                  const isWinning = current >= line;
                  won = isCompleted
                    ? isWinning
                      ? true
                      : false
                    : halfInProgress
                      ? isWinning
                        ? true
                        : "in progress"
                      : isWinning
                        ? true
                        : false; // Half complete, evaluate result
                } else {
                  const isWinning = current <= line;
                  if (halfInProgress) won = isWinning ? "in progress" : false;
                  else if (!isCompleted)
                    won = isWinning ? true : false; // Half complete
                  else won = isWinning ? true : false;
                }
                eventData.bets[keyName] = {
                  bet: token,
                  line,
                  current,
                  type: isOver ? "over" : "under",
                  won,
                };
              }
            };
            processHalfTeamPoints(
              halfHomePointsVal,
              "home",
              `homePoints${halfIndex}H`,
            );
            processHalfTeamPoints(
              halfAwayPointsVal,
              "away",
              `awayPoints${halfIndex}H`,
            );

            // Legacy format: 1HTP=TBo23.5
            if (halfTPVal) {
              const m = String(halfTPVal).match(
                /^([A-Z]{1,5})([ouOU])([0-9.]+)$/i,
              );
              if (m) {
                const teamAbbr = m[1].toUpperCase();
                const isOver = m[2].toLowerCase() === "o";
                const line = parseFloat(m[3]);
                const current = teamAbbr === homeAbbr ? homeHalf : awayHalf;
                // Check if any periods in this half are in progress
                let halfInProgress = false;
                if (maxPeriods <= 2) {
                  halfInProgress = isPeriodInProgress(
                    halfIndex,
                    homeLines,
                    awayLines,
                    gameStatus?.state,
                    isCompleted,
                  );
                } else {
                  halfInProgress = periods.some((p) =>
                    isPeriodInProgress(
                      p,
                      homeLines,
                      awayLines,
                      gameStatus?.state,
                      isCompleted,
                    ),
                  );
                }
                let won;
                const isWinning = isOver ? current >= line : current <= line;
                won = isCompleted ? (isWinning ? true : false) : "pending";
                eventData.bets[`H${halfIndex}_TP`] =
                  eventData.bets[`H${halfIndex}_TP`] || [];
                eventData.bets[`H${halfIndex}_TP`].push({
                  team: teamAbbr,
                  bet: halfTPVal,
                  current,
                  line,
                  type: isOver ? "over" : "under",
                  won,
                });
              }
            }
          }

          // Both Teams To Score (bothScore)
          try {
            const bothScoreToken = getParamValueForGame("bothScore", gi);
            if (bothScoreToken) {
              const homeScore =
                parseInt(
                  competitors.find((c) => c.homeAway === "home")?.score,
                ) || 0;
              const awayScore =
                parseInt(
                  competitors.find((c) => c.homeAway === "away")?.score,
                ) || 0;
              const occurred = homeScore >= 1 && awayScore >= 1;
              const tkn = String(bothScoreToken).toLowerCase();
              const isInProgress = !isCompleted && gameStatus?.state === "in";
              if (tkn === "yes" || tkn === "no") {
                const won = tkn === "yes" ? occurred : !occurred;
                eventData.bets.bothScore = {
                  bet: bothScoreToken,
                  current: occurred ? 1 : 0,
                  won: isCompleted
                    ? won
                    : isInProgress
                      ? "in progress"
                      : "pending",
                };
              } else {
                eventData.bets.bothScore = {
                  bet: bothScoreToken,
                  current: occurred ? 1 : 0,
                  won: isCompleted
                    ? tkn === String(occurred).toLowerCase()
                    : isInProgress
                      ? "in progress"
                      : "pending",
                };
              }
            }
          } catch (e) {
            /* ignore bothScore errors */
          }

          // Team goals O/U: homeGoals / awayGoals
          try {
            const homeGoalsToken = getParamValueForGame("homeGoals", gi);
            const awayGoalsToken = getParamValueForGame("awayGoals", gi);
            const homeScore =
              parseInt(competitors.find((c) => c.homeAway === "home")?.score) ||
              0;
            const awayScore =
              parseInt(competitors.find((c) => c.homeAway === "away")?.score) ||
              0;
            const processGoalToken = (token, teamSide, keyName) => {
              if (!token) return;
              const tkn = String(token || "").trim();
              const mOU = tkn.match(/^[ou]([0-9.]+)/i);
              const mPlus = tkn.match(/^([0-9]+(?:\.[0-9]+)?)\+$/);
              const mMinus = tkn.match(/^([0-9]+(?:\.[0-9]+)?)-$/);
              const mNum = tkn.match(/^([0-9]+(?:\.[0-9]+)?)$/);
              let isOver = false;
              let line = null;
              if (mOU) {
                isOver = /^o/i.test(tkn);
                line = parseFloat(mOU[1]);
              } else if (mPlus) {
                isOver = true;
                line = parseFloat(mPlus[1]);
              } else if (mMinus) {
                isOver = false;
                line = parseFloat(mMinus[1]);
              } else if (mNum) {
                isOver = true;
                line = parseFloat(mNum[1]);
              }
              if (line === null) return;
              const current = teamSide === "home" ? homeScore : awayScore;
              const isInProgress = !isCompleted && gameStatus?.state === "in";
              let won;
              if (isOver) {
                const isWinning = current >= line;
                won = isCompleted
                  ? isWinning
                    ? true
                    : false
                  : isInProgress
                    ? isWinning
                      ? true
                      : "in progress"
                    : "pending";
              } else {
                const isWinning = current <= line;
                if (isInProgress) won = isWinning ? "in progress" : false;
                else if (!isCompleted) won = "pending";
                else won = isWinning ? true : false;
              }
              eventData.bets[keyName] = {
                bet: token,
                line,
                current,
                type: isOver ? "over" : "under",
                won,
              };
            };
            processGoalToken(homeGoalsToken, "home", "homeGoals");
            processGoalToken(awayGoalsToken, "away", "awayGoals");
          } catch (e) {
            /* ignore goal O/U errors */
          }

          // cornerSpread and cardSpread (per-team spreads)
          try {
            const boxTeams = summaryData.boxscore?.teams || [];
            const findBoxTeam = (abbr) => {
              for (const t of boxTeams) {
                try {
                  const a =
                    t.team?.abbreviation ||
                    t.team?.shortDisplayName ||
                    t.team?.name ||
                    "";
                  if (String(a).toUpperCase() === String(abbr).toUpperCase())
                    return t;
                } catch (e) {}
              }
              return null;
            };

            const sumStatForTeam = (teamObj, pattern) => {
              try {
                if (!teamObj) return 0;
                const stats =
                  teamObj.statistics ||
                  teamObj.statisticsData ||
                  teamObj.stats ||
                  {};
                if (!stats) return 0;
                if (Array.isArray(stats)) {
                  for (const item of stats) {
                    if (!item) continue;
                    const candidates = [
                      item.label,
                      item.name,
                      item.displayName,
                      item.stat,
                      item.key,
                    ];
                    for (const c of candidates) {
                      if (!c) continue;
                      if (pattern.test(String(c))) {
                        const raw =
                          item.value ||
                          item.displayValue ||
                          item.statValue ||
                          item.number ||
                          item.count ||
                          item.total ||
                          null;
                        return (
                          parseInt(
                            String(raw || "0").replace(/[^0-9\-]/g, ""),
                          ) || 0
                        );
                      }
                    }
                  }
                }
                if (typeof stats === "object") {
                  for (const k of Object.keys(stats || {})) {
                    if (pattern.test(String(k))) {
                      let val = stats[k];
                      if (val && typeof val === "object") {
                        val =
                          val.value ||
                          val.displayValue ||
                          val.count ||
                          val.total ||
                          JSON.stringify(val);
                      }
                      return (
                        parseInt(String(val || "0").replace(/[^0-9\-]/g, "")) ||
                        0
                      );
                    }
                  }
                }
                return 0;
              } catch (e) {
                return 0;
              }
            };

            const cornerSpreadToken = getParamValueForGame("cornerSpread", gi);
            if (cornerSpreadToken) {
              const m = String(cornerSpreadToken).match(
                /^([A-Z]{1,5})[+\s]?([+-]?[0-9.]+)$/i,
              );
              if (m) {
                const teamAbbr = m[1].toUpperCase();
                const line = parseFloat(m[2]);
                const teamObj = findBoxTeam(teamAbbr);
                // find opposing team
                const oppObj = boxTeams.find((t) => t !== teamObj) || null;
                const teamCorners = sumStatForTeam(teamObj, /corner/i);
                const oppCorners = sumStatForTeam(oppObj, /corner/i);
                const adjusted = teamCorners + line;
                const isWinning = adjusted > oppCorners;
                const isInProgress = !isCompleted && gameStatus?.state === "in";
                eventData.bets.cornerSpread = {
                  team: teamAbbr,
                  line,
                  current: (oppCorners || 0) - (teamCorners || 0),
                  won: isCompleted
                    ? isWinning
                      ? true
                      : false
                    : isInProgress
                      ? "in progress"
                      : "pending",
                };
              }
            }

            const cardSpreadToken = getParamValueForGame("cardSpread", gi);
            if (cardSpreadToken) {
              const m = String(cardSpreadToken).match(
                /^([A-Z]{1,5})[+\s]?([+-]?[0-9.]+)$/i,
              );
              if (m) {
                const teamAbbr = m[1].toUpperCase();
                const line = parseFloat(m[2]);
                const teamObj = findBoxTeam(teamAbbr);
                const oppObj = boxTeams.find((t) => t !== teamObj) || null;
                const yellowTeam = sumStatForTeam(teamObj, /yellow/i);
                const redTeam = sumStatForTeam(teamObj, /red/i);
                const yellowOpp = sumStatForTeam(oppObj, /yellow/i);
                const redOpp = sumStatForTeam(oppObj, /red/i);
                // weighting: yellow=1, red=2
                const teamCards =
                  (Number(yellowTeam) || 0) + (Number(redTeam) || 0) * 2;
                const oppCards =
                  (Number(yellowOpp) || 0) + (Number(redOpp) || 0) * 2;
                const adjusted = teamCards + line;
                const isWinning = adjusted > oppCards;
                const isInProgress = !isCompleted && gameStatus?.state === "in";
                eventData.bets.cardSpread = {
                  team: teamAbbr,
                  line,
                  current: (oppCards || 0) - (teamCards || 0),
                  won: isCompleted
                    ? isWinning
                      ? true
                      : false
                    : isInProgress
                      ? "in progress"
                      : "pending",
                };
              }
            }
          } catch (e) {
            /* ignore corner/card spread errors */
          }

          // First/last scoring events: prefer transformed data when fetched from the transformed endpoint
          const transformed =
            summaryData && (summaryData.boxscore || summaryData.firstBasket)
              ? summaryData
              : transformSummaryData(summaryData) || {};
          // Support common param variants/typos for first touchdown
          const firstTDToken =
            getParamValueForGame("firstTouchdown", gi) ||
            getParamValueForGame("firstTD", gi) ||
            getParamValueForGame("firstToucdown", gi) ||
            getParamValueForGame("first_touchdown", gi);
          if (firstTDToken && transformed.firstTouchdown) {
            const tokenRaw = String(firstTDToken);
            const token = tokenRaw.toLowerCase();
            const team =
              transformed.firstTouchdown.teamAbbr ||
              transformed.firstTouchdown.team?.abbreviation;
            const athleteId = String(
              transformed.firstTouchdown.athleteId ||
                transformed.firstTouchdown.athlete?.id ||
                "",
            );
            if (token === "yes" || token === "no") {
              const occurred = !!transformed.firstTouchdown;
              eventData.bets.firstTouchdown = {
                bet: firstTDToken,
                won: token === "yes" ? occurred : !occurred,
              };
            } else if (/^[0-9]+$/.test(tokenRaw)) {
              // numeric athlete id
              eventData.bets.firstTouchdown = {
                bet: firstTDToken,
                won: athleteId === tokenRaw,
              };
            } else {
              eventData.bets.firstTouchdown = {
                bet: firstTDToken,
                won: (team || "") === tokenRaw.toUpperCase(),
              };
            }
          }

          const lastTDToken =
            getParamValueForGame("lastTouchdown", gi) ||
            getParamValueForGame("lastTD", gi) ||
            getParamValueForGame("last_touchdown", gi);
          if (lastTDToken && transformed.lastTouchdown) {
            const tokenRaw = String(lastTDToken);
            const token = tokenRaw.toLowerCase();
            const team =
              transformed.lastTouchdown.teamAbbr ||
              transformed.lastTouchdown.team?.abbreviation;
            const athleteId = String(
              transformed.lastTouchdown.athleteId ||
                transformed.lastTouchdown.athlete?.id ||
                "",
            );
            if (token === "yes" || token === "no") {
              const occurred = !!transformed.lastTouchdown;
              eventData.bets.lastTouchdown = {
                bet: lastTDToken,
                won: token === "yes" ? occurred : !occurred,
              };
            } else if (/^[0-9]+$/.test(tokenRaw)) {
              eventData.bets.lastTouchdown = {
                bet: lastTDToken,
                won: athleteId === tokenRaw,
              };
            } else {
              eventData.bets.lastTouchdown = {
                bet: lastTDToken,
                won: (team || "") === tokenRaw.toUpperCase(),
              };
            }
          }

          // NBA: firstBasket
          const firstBasketToken = getParamValueForGame("firstBasket", gi);
          if (firstBasketToken && transformed.firstBasket) {
            const tokenRaw = String(firstBasketToken || "");
            const token = tokenRaw.toLowerCase();
            const team =
              transformed.firstBasket.teamAbbr ||
              transformed.firstBasket.team?.abbreviation;
            // support boolean yes/no, numeric athlete id, or team abbr
            if (token === "yes" || token === "no") {
              const occurred = !!transformed.firstBasket;
              eventData.bets.firstBasket = {
                bet: firstBasketToken,
                won: token === "yes" ? occurred : !occurred,
              };
            } else if (/^[0-9]+$/.test(tokenRaw)) {
              // numeric athlete id
              const athleteId = String(
                transformed.firstBasket.athleteId ||
                  transformed.firstBasket.athlete?.id ||
                  "",
              );
              const obj = {
                bet: firstBasketToken,
                won: athleteId === tokenRaw,
              };
              // Try to augment with displayName and team color from multiple sources
              try {
                // 1) Search summaryData.boxscore.players if present
                const bsPlayers = summaryData.boxscore?.players || [];
                if (Array.isArray(bsPlayers) && bsPlayers.length) {
                  for (const pt of bsPlayers) {
                    const statsBlock = Array.isArray(pt.statistics)
                      ? pt.statistics[0]
                      : pt.statistics || {};
                    const athletes = statsBlock?.athletes || [];
                    const found = athletes.find(
                      (a) => String(a.athlete?.id) === tokenRaw,
                    );
                    if (found) {
                      obj.displayName =
                        found.athlete?.displayName ||
                        found.athlete?.name ||
                        obj.displayName ||
                        null;
                      // try to get team color from matching boxscore teams array
                      const bsTeams = summaryData.boxscore?.teams || [];
                      const teamMatch = bsTeams.find(
                        (t) =>
                          String(t.team?.id) === String(pt.team?.id) ||
                          String(t.team?.abbreviation) ===
                            String(pt.team?.abbreviation),
                      );
                      if (teamMatch)
                        obj.color =
                          teamMatch.team?.color ||
                          teamMatch.team?.alternateColor ||
                          obj.color;
                      break;
                    }
                  }
                }

                // 2) If not found, search transformed.boxscore.players
                if (!obj.displayName && transformed?.boxscore?.players) {
                  for (const tb of transformed.boxscore.players) {
                    const tat = tb.statistics?.athletes || [];
                    const f = tat.find(
                      (x) => String(x.athlete?.id) === tokenRaw,
                    );
                    if (f) {
                      obj.displayName =
                        f.athlete?.displayName || obj.displayName || null;
                      obj.color =
                        obj.color ||
                        tb.team?.color ||
                        tb.team?.alternateColor ||
                        null;
                      break;
                    }
                  }
                }

                // 3) Fallback to rosters (UEFA-style)
                if (!obj.displayName) {
                  const rawRosters =
                    summaryData.boxscore?.rosters || summaryData.rosters || [];
                  for (const r of rawRosters) {
                    const teamColor =
                      r?.team?.color || r?.team?.alternateColor || null;
                    const roster = r.roster || [];
                    for (const p of roster) {
                      const pid =
                        p?.athlete?.id ||
                        p?.athlete?.uid ||
                        p?.athlete?.externalId ||
                        null;
                      if (!pid) continue;
                      if (String(pid) === tokenRaw) {
                        obj.displayName =
                          p.athlete?.displayName || p.athlete?.name || null;
                        if (teamColor) obj.color = teamColor;
                        break;
                      }
                    }
                    if (obj.displayName) break;
                  }
                }
              } catch (e) {}
              eventData.bets.firstBasket = obj;
            } else {
              eventData.bets.firstBasket = {
                bet: firstBasketToken,
                won: (team || "") === tokenRaw.toUpperCase(),
              };
            }
          }

          // NHL: firstGoal / lastGoal
          const firstGoalToken =
            getParamValueForGame("firstGoal", gi) ||
            getParamValueForGame(`firstGoal${explicitSport}`, gi) ||
            getParamValueForGame(`firstGoal_${explicitSport}`, gi) ||
            getParamValueForGame(
              `firstGoal${String(explicitSport).toUpperCase()}`,
              gi,
            ) ||
            getParamValueForGame(
              `firstGoal_${String(explicitSport).toUpperCase()}`,
              gi,
            );
          if (firstGoalToken && transformed.firstGoal) {
            const token = String(firstGoalToken).toLowerCase();
            const team =
              transformed.firstGoal.teamAbbr ||
              transformed.firstGoal.team?.abbreviation;

            const buildBetObj = (wonVal) => {
              const obj = { bet: firstGoalToken, won: wonVal };
              // If the bet is an athlete id, try to find displayName and team color from rosters
              if (/^\d+$/.test(String(firstGoalToken))) {
                try {
                  const rawRosters =
                    summaryData.boxscore?.rosters || summaryData.rosters || [];
                  for (const r of rawRosters) {
                    const teamColor =
                      r?.team?.color || r?.team?.alternateColor || null;
                    const roster = r.roster || [];
                    for (const p of roster) {
                      const pid =
                        p?.athlete?.id ||
                        p?.athlete?.uid ||
                        p?.athlete?.externalId ||
                        null;
                      if (!pid) continue;
                      if (String(pid) === String(firstGoalToken)) {
                        obj.displayName =
                          p.athlete?.displayName || p.athlete?.name || null;
                        if (teamColor) obj.color = teamColor;
                        break;
                      }
                    }
                    if (obj.displayName) break;
                  }
                } catch (e) {
                  /* ignore roster lookup errors */
                }
              }
              return obj;
            };

            if (token === "yes" || token === "no") {
              const occurred = !!transformed.firstGoal;
              eventData.bets.firstGoal = buildBetObj(
                token === "yes" ? occurred : !occurred,
              );
            } else {
              const won = (team || "") === String(firstGoalToken).toUpperCase();
              eventData.bets.firstGoal = buildBetObj(won);
            }
          }

          const lastGoalToken =
            getParamValueForGame("lastGoal", gi) ||
            getParamValueForGame(`lastGoal${explicitSport}`, gi) ||
            getParamValueForGame(`lastGoal_${explicitSport}`, gi) ||
            getParamValueForGame(
              `lastGoal${String(explicitSport).toUpperCase()}`,
              gi,
            ) ||
            getParamValueForGame(
              `lastGoal_${String(explicitSport).toUpperCase()}`,
              gi,
            );
          if (lastGoalToken && transformed.lastGoal) {
            const token = String(lastGoalToken).toLowerCase();
            const team =
              transformed.lastGoal.teamAbbr ||
              transformed.lastGoal.team?.abbreviation;

            const buildLastObj = (wonVal) => {
              const obj = { bet: lastGoalToken, won: wonVal };
              if (/^\d+$/.test(String(lastGoalToken))) {
                try {
                  const rawRosters =
                    summaryData.boxscore?.rosters || summaryData.rosters || [];
                  for (const r of rawRosters) {
                    const teamColor =
                      r?.team?.color || r?.team?.alternateColor || null;
                    const roster = r.roster || [];
                    for (const p of roster) {
                      const pid =
                        p?.athlete?.id ||
                        p?.athlete?.uid ||
                        p?.athlete?.externalId ||
                        null;
                      if (!pid) continue;
                      if (String(pid) === String(lastGoalToken)) {
                        obj.displayName =
                          p.athlete?.displayName || p.athlete?.name || null;
                        if (teamColor) obj.color = teamColor;
                        break;
                      }
                    }
                    if (obj.displayName) break;
                  }
                } catch (e) {
                  /* ignore roster lookup errors */
                }
              }
              return obj;
            };

            if (token === "yes" || token === "no") {
              const occurred = !!transformed.lastGoal;
              eventData.bets.lastGoal = buildLastObj(
                token === "yes" ? occurred : !occurred,
              );
            } else {
              const won = (team || "") === String(lastGoalToken).toUpperCase();
              eventData.bets.lastGoal = buildLastObj(won);
            }
          }

          // UEFA-specific totals: corners and cards
          try {
            const totalCornerToken =
              getParamValueForGame("totalCorner", gi) ||
              getParamValueForGame("totalCorners", gi);
            const totalCardsToken =
              getParamValueForGame("totalCards", gi) ||
              getParamValueForGame("totalCard", gi);
            // Helper to sum stat from boxscore. Accept keys by fuzzy match and handle
            // both object-mapped stats (key -> value) and array-shaped stats
            // (items with label/name/displayName and value fields).
            const sumBoxscoreStat = (pattern) => {
              try {
                const teams = summaryData.boxscore?.teams || [];
                let sum = 0;
                for (const t of teams) {
                  const stats =
                    t.statistics || t.statisticsData || t.stats || {};
                  if (!stats) continue;

                  // If stats is an array of stat objects, try common fields
                  if (Array.isArray(stats)) {
                    let found = false;
                    for (const item of stats) {
                      if (!item) continue;
                      const candidates = [];
                      if (item.label) candidates.push(item.label);
                      if (item.name) candidates.push(item.name);
                      if (item.displayName) candidates.push(item.displayName);
                      if (item.stat) candidates.push(item.stat);
                      if (item.key) candidates.push(item.key);
                      for (const c of candidates) {
                        try {
                          if (pattern.test(String(c || ""))) {
                            const raw =
                              item.value ||
                              item.displayValue ||
                              item.statValue ||
                              item.number ||
                              item.count ||
                              item.total ||
                              item.stats ||
                              null;
                            const n =
                              parseInt(
                                String(raw || "0").replace(/[^0-9\-]/g, ""),
                              ) || 0;
                            sum += n;
                            found = true;
                            break;
                          }
                        } catch (e) {}
                      }
                      if (found) break;
                    }
                    if (found) continue;
                  }

                  // If stats is an object mapping label->value
                  if (typeof stats === "object") {
                    let val = null;
                    for (const k of Object.keys(stats || {})) {
                      try {
                        if (pattern.test(String(k))) {
                          val = stats[k];
                          break;
                        }
                      } catch (e) {}
                    }
                    if (val && typeof val === "object") {
                      const raw =
                        val.value ||
                        val.displayValue ||
                        val.stats ||
                        val.count ||
                        val.total ||
                        null;
                      val = raw !== undefined ? raw : JSON.stringify(val);
                    }
                    const n =
                      parseInt(String(val || "0").replace(/[^0-9\-]/g, "")) ||
                      0;
                    sum += n;
                    continue;
                  }
                }
                return sum;
              } catch (e) {
                return 0;
              }
            };

            if (totalCornerToken) {
              const totalCorners = sumBoxscoreStat(/corner/i);
              const tkn = String(totalCornerToken || "").trim();
              console.log(
                `[Betslip][UEFA] totalCorner token raw='${String(
                  totalCornerToken,
                )}' parsed='${tkn}' totalCorners=${totalCorners}`,
              );
              const mOU = tkn.match(/^[ou]([0-9.]+)/i);
              const mPlus = tkn.match(/^([0-9]+(?:\.[0-9]+)?)\+$/);
              const mMinus = tkn.match(/^([0-9]+(?:\.[0-9]+)?)-$/);
              const mNum = tkn.match(/^([0-9]+(?:\.[0-9]+)?)$/);
              console.log(
                `[Betslip][UEFA] totalCorner regex mOU=${!!mOU} mPlus=${!!mPlus} mMinus=${!!mMinus} mNum=${!!mNum}`,
              );
              let isOver = false;
              let line = null;
              if (mOU) {
                isOver = /^o/i.test(tkn);
                line = parseFloat(mOU[1]);
              } else if (mPlus) {
                isOver = true;
                line = parseFloat(mPlus[1]);
              } else if (mMinus) {
                isOver = false;
                line = parseFloat(mMinus[1]);
              } else if (mNum) {
                // Accept bare numbers (e.g., 10) as shorthand for over (equivalent to 10+)
                isOver = true;
                line = parseFloat(mNum[1]);
              }
              if (line !== null) {
                const isInProgress = !isCompleted && gameStatus?.state === "in";
                let won;
                if (isOver) {
                  const isWinning = totalCorners >= line;
                  won = isCompleted
                    ? isWinning
                      ? true
                      : false
                    : isInProgress
                      ? "in progress"
                      : "pending";
                } else {
                  if (isInProgress)
                    won = totalCorners <= line ? "in progress" : false;
                  else if (!isCompleted) won = "pending";
                  else {
                    won = totalCorners <= line ? true : false;
                  }
                }
                eventData.bets.totalCorner = {
                  bet: totalCornerToken,
                  line,
                  current: totalCorners,
                  type: isOver ? "over" : "under",
                  won,
                };
              }
            }

            if (totalCardsToken) {
              // Sum yellow + red
              const yellow = sumBoxscoreStat(/yellow/i);
              const red = sumBoxscoreStat(/red/i);
              const totalCards = (Number(yellow) || 0) + (Number(red) || 0) * 2;
              const tkn = String(totalCardsToken || "").trim();
              console.log(
                `[Betslip][UEFA] totalCards token raw='${String(
                  totalCardsToken,
                )}' parsed='${tkn}' totalCards=${totalCards}`,
              );
              const mOU = tkn.match(/^[ou]([0-9.]+)/i);
              const mPlus = tkn.match(/^([0-9]+(?:\.[0-9]+)?)\+$/);
              const mMinus = tkn.match(/^([0-9]+(?:\.[0-9]+)?)-$/);
              const mNum = tkn.match(/^([0-9]+(?:\.[0-9]+)?)$/);
              console.log(
                `[Betslip][UEFA] totalCards regex mOU=${!!mOU} mPlus=${!!mPlus} mMinus=${!!mMinus} mNum=${!!mNum}`,
              );
              let isOver = false;
              let line = null;
              if (mOU) {
                isOver = /^o/i.test(tkn);
                line = parseFloat(mOU[1]);
              } else if (mPlus) {
                isOver = true;
                line = parseFloat(mPlus[1]);
              } else if (mMinus) {
                isOver = false;
                line = parseFloat(mMinus[1]);
              } else if (mNum) {
                // Accept bare numbers (e.g., 3) as shorthand for over (equivalent to 3+)
                isOver = true;
                line = parseFloat(mNum[1]);
              }
              if (line !== null) {
                const isInProgress = !isCompleted && gameStatus?.state === "in";
                let won;
                if (isOver) {
                  const isWinning = totalCards >= line;
                  won = isCompleted
                    ? isWinning
                      ? true
                      : false
                    : isInProgress
                      ? "in progress"
                      : "pending";
                } else {
                  if (isInProgress)
                    won = totalCards <= line ? "in progress" : false;
                  else if (!isCompleted) won = "pending";
                  else {
                    won = totalCards <= line ? true : false;
                  }
                }
                eventData.bets.totalCards = {
                  bet: totalCardsToken,
                  line,
                  current: totalCards,
                  type: isOver ? "over" : "under",
                  won,
                };
              }
            }
          } catch (e) {
            /* ignore UEFA totals errors */
          }
        } catch (e) {
          console.log(
            `[Betslip] Additional bets processing error for ${rawGameToken}: ${
              e?.message || e
            }`,
          );
        }

        // Process player bets
        const boxscorePlayers = summaryData.boxscore?.players || [];
        const boxscoreTeams = summaryData.boxscore?.teams || [];
        const players = [];

        console.log(
          `[Betslip] Boxscore players count: ${boxscorePlayers.length}`,
        );

        Object.keys(playerBets).forEach((key) => {
          const playerMatch = key.match(/^p(\d+)$/);
          if (!playerMatch) return;
          const playerId = playerBets[key];
          console.log(`[Betslip] Looking for player ID: ${playerId}`);

          const playerData = {
            id: playerId,
            name: null,
            color: null,
            overUnder: {},
            milestones: {},
          };

          // Try to locate athlete in boxscore.players
          let foundAthlete = null;
          let foundLabels = [];
          let foundStatsArr = [];
          let foundTeamId = null;

          try {
            for (const team of boxscorePlayers || []) {
              const statisticsData = Array.isArray(team.statistics)
                ? team.statistics[0]
                : team.statistics || {};
              const athletes = statisticsData?.athletes || [];
              const athlete = athletes.find(
                (a) => String(a.athlete?.id) === String(playerId),
              );
              if (athlete) {
                foundAthlete = athlete;
                foundLabels = statisticsData.labels || [];
                foundStatsArr = athlete.stats || [];
                foundTeamId = team.team?.id || null;
                playerData.name =
                  athlete.athlete?.displayName ||
                  athlete.athlete?.displayName ||
                  null;
                console.log(
                  `[Betslip] Found athlete in boxscore.players for id=${playerId}, displayName=${playerData.name}, teamId=${foundTeamId}, stats=`,
                  athlete.stats,
                );
                try {
                  const allTransformedAthletes = (
                    transformed?.boxscore?.players || []
                  ).flatMap((p) => p.statistics?.athletes || []);
                  const transformedMatch = allTransformedAthletes.find(
                    (a) => String(a.athlete?.id) === String(playerId),
                  );
                  console.log(
                    `[Betslip] Transformed source used: ${
                      usedTransformedSource ? "true" : "false"
                    }`,
                  );
                  console.log(
                    `[Betslip] Matching athlete from transformed summary (if any):`,
                    transformedMatch || "<no transformed athlete found>",
                    "\nTransformed boxscore players count:",
                    (transformed?.boxscore?.players || []).length,
                  );
                } catch (e) {
                  /* non-fatal */
                }
                console.log(
                  `[Betslip] Found athlete 1Q data (pre-attach):`,
                  athlete["1Q"] || athlete.athlete?.["1Q"] || null,
                );
                // Attach per-period 1Q stats from transformed summary if available
                try {
                  if (
                    transformed &&
                    transformed.boxscore &&
                    Array.isArray(transformed.boxscore.players)
                  ) {
                    for (const tb of transformed.boxscore.players) {
                      const tat = tb.statistics?.athletes || [];
                      const found = tat.find(
                        (x) => String(x.athlete?.id) === String(playerId),
                      );
                      if (found && found["1Q"]) {
                        // ensure resolver can find it either on top-level or under athlete
                        foundAthlete["1Q"] = found["1Q"];
                        break;
                      }
                    }
                  }
                } catch (e) {
                  /* non-fatal */
                }
                break;
              }
            }
          } catch (e) {
            /* ignore */
          }

          // Lookup team color from boxscore.teams if we have a team ID
          if (foundTeamId && boxscoreTeams.length > 0) {
            const teamData = boxscoreTeams.find(
              (t) => String(t.team?.id) === String(foundTeamId),
            );
            if (teamData && teamData.team?.color) {
              playerData.color = teamData.team.color;
              console.log(
                `[Betslip] Found team color for player ${playerId}: ${playerData.color}`,
              );
            }
          }

          // Fallback: search raw rosters (UEFA and others)
          if (!foundAthlete) {
            try {
              const rawRosters =
                summaryData.boxscore?.rosters || summaryData.rosters || [];
              for (const r of rawRosters) {
                const roster = r.roster || [];
                for (const p of roster) {
                  const pid =
                    p?.athlete?.id ||
                    p?.athlete?.uid ||
                    p?.athlete?.externalId ||
                    null;
                  if (!pid) continue;
                  if (String(pid) === String(playerId)) {
                    const name =
                      p.athlete?.displayName || p.athlete?.name || null;
                    playerData.name = name;
                    // Capture team color from roster
                    if (r.team?.color) {
                      playerData.color = r.team.color;
                      console.log(
                        `[Betslip] Found team color from roster for player ${playerId}: ${playerData.color}`,
                      );
                    }
                    // Convert stats object to labels + array for compatibility
                    const statsObj =
                      p.stats && typeof p.stats === "object" ? p.stats : null;
                    console.log(
                      `[Betslip] Found athlete in rosters for id=${playerId}, displayName=${name}, teamColor=${playerData.color}, statsObj=`,
                      statsObj || p.stats || p,
                    );
                    if (statsObj) {
                      // Some roster stats are an array of stat objects (name, abbreviation, value)
                      if (Array.isArray(statsObj)) {
                        const labelsArr = [];
                        const valsArr = [];
                        for (const it of statsObj) {
                          if (!it) continue;
                          const label =
                            it.abbreviation ||
                            it.shortDisplayName ||
                            it.displayName ||
                            it.name ||
                            null;
                          const rawVal =
                            it.value ??
                            it.displayValue ??
                            it.count ??
                            it.total ??
                            null;
                          labelsArr.push(String(label || "").toUpperCase());
                          valsArr.push(
                            rawVal !== null && rawVal !== undefined
                              ? String(rawVal)
                              : null,
                          );
                        }
                        foundLabels = labelsArr;
                        foundStatsArr = valsArr;
                        console.log(
                          `[Betslip] Normalized roster stats for player ${playerId}: labels=${JSON.stringify(
                            foundLabels,
                          )}, values=${JSON.stringify(foundStatsArr)}`,
                        );
                      } else {
                        foundLabels = Object.keys(statsObj || []);
                        foundStatsArr = foundLabels.map((lbl) => statsObj[lbl]);
                      }
                    }
                    foundAthlete = {
                      athlete: { id: String(pid), displayName: name },
                      stats: foundStatsArr,
                    };
                    // Attach per-period 1Q stats from transformed summary if available
                    try {
                      if (
                        transformed &&
                        transformed.boxscore &&
                        Array.isArray(transformed.boxscore.players)
                      ) {
                        for (const tb of transformed.boxscore.players) {
                          const tat = tb.statistics?.athletes || [];
                          const found = tat.find(
                            (x) => String(x.athlete?.id) === String(playerId),
                          );
                          if (found && found["1Q"]) {
                            foundAthlete["1Q"] = found["1Q"];
                            break;
                          }
                        }
                      }
                    } catch (e) {
                      /* non-fatal */
                    }
                    break;
                  }
                }
                if (foundAthlete) break;
              }
            } catch (e) {
              /* ignore roster lookup errors */
            }
          }

          // If athlete located, process their bets
          if (foundAthlete) {
            const labels = foundLabels || [];
            const athlete = foundAthlete;

            Object.keys(playerBets).forEach((betKey) => {
              const statMatch = betKey.match(/^p(\d+)_(\w+)$/);
              if (!statMatch) return;
              const [, num, stat] = statMatch;
              if (num !== playerMatch[1]) return;
              const betValue = playerBets[betKey];
              const statUpper = stat.toUpperCase();

              // Find stat index in labels
              let statIndex = labels.indexOf(statUpper);
              if (statIndex === -1) {
                const aliasIdx = findStatIndexByAlias(labels, statUpper);
                if (aliasIdx === -2) statIndex = -2;
                else if (aliasIdx >= 0) statIndex = aliasIdx;
              }

              const bv = String(betValue || "").toLowerCase();
              const athleteId =
                athlete.athlete?.id || athlete.athleteId || athlete.id;

              // Handle first/last scoring boolean player bets
              const handleFirstLast = () => {
                try {
                  if (statUpper === "FIRSTBASKET") {
                    const hasData =
                      summaryData.firstBasket &&
                      summaryData.firstBasket.athleteId;
                    const occurred = !!(
                      hasData &&
                      String(summaryData.firstBasket.athleteId) ===
                        String(athleteId)
                    );
                    if (bv === "yes" || bv === "no") {
                      let won;
                      if (bv === "yes") {
                        // If data exists, evaluate; if no data yet and game not complete, pending
                        won = hasData
                          ? occurred
                            ? true
                            : false
                          : isCompleted
                            ? false
                            : "in progress";
                      } else {
                        // bet = "no": if data exists and it's someone else, mark true; if no data yet, pending
                        won = hasData
                          ? !occurred
                            ? true
                            : false
                          : isCompleted
                            ? true
                            : "in progress";
                      }
                      playerData.milestones[statUpper] = {
                        bet: betValue,
                        current: occurred ? 1 : 0,
                        won,
                      };
                      return { handled: true };
                    }
                  }
                  if (
                    statUpper === "FIRSTTOUCHDOWN" ||
                    statUpper === "FIRSTTD"
                  ) {
                    const occurred = !!(
                      summaryData.firstTouchdown &&
                      String(summaryData.firstTouchdown.athleteId) ===
                        String(athleteId)
                    );
                    if (bv === "yes" || bv === "no") {
                      let won;
                      if (bv === "yes") {
                        won = occurred
                          ? true
                          : isCompleted
                            ? false
                            : "in progress";
                      } else {
                        won = isCompleted
                          ? !occurred
                          : occurred
                            ? false
                            : "in progress";
                      }
                      playerData.milestones[statUpper] = {
                        bet: betValue,
                        current: occurred ? 1 : 0,
                        won,
                      };
                      return { handled: true };
                    }
                  }
                  if (statUpper === "LASTTOUCHDOWN" || statUpper === "LASTTD") {
                    const occurred = !!(
                      summaryData.lastTouchdown &&
                      String(summaryData.lastTouchdown.athleteId) ===
                        String(athleteId)
                    );
                    if (bv === "yes" || bv === "no") {
                      let won;
                      if (bv === "yes") {
                        won = occurred
                          ? true
                          : isCompleted
                            ? false
                            : "in progress";
                      } else {
                        won = isCompleted
                          ? !occurred
                          : occurred
                            ? false
                            : "in progress";
                      }
                      playerData.milestones[statUpper] = {
                        bet: betValue,
                        current: occurred ? 1 : 0,
                        won,
                      };
                      return { handled: true };
                    }
                  }
                  if (statUpper === "FIRSTGOAL") {
                    let occurred = false;
                    let hasData = false;
                    if (summaryData.firstGoal) {
                      if (summaryData.firstGoal.athleteId) {
                        hasData = true;
                        occurred =
                          String(summaryData.firstGoal.athleteId) ===
                          String(athleteId);
                      } else if (
                        Array.isArray(summaryData.firstGoal.participants)
                      ) {
                        hasData = summaryData.firstGoal.participants.length > 0;
                        for (const p of summaryData.firstGoal.participants) {
                          const keys = Object.keys(p || {});
                          if (
                            keys.find((k) => String(k) === String(athleteId))
                          ) {
                            occurred = true;
                            break;
                          }
                        }
                      }
                    }
                    if (bv === "yes" || bv === "no") {
                      let won;
                      if (bv === "yes") {
                        // If data exists, evaluate; if no data yet and game not complete, pending
                        won = hasData
                          ? occurred
                            ? true
                            : false
                          : isCompleted
                            ? false
                            : "in progress";
                      } else {
                        // bet = "no": if data exists and it's someone else, mark true; if no data yet, pending
                        won = hasData
                          ? !occurred
                            ? true
                            : false
                          : isCompleted
                            ? true
                            : "in progress";
                      }
                      playerData.milestones[statUpper] = {
                        bet: betValue,
                        current: occurred ? 1 : 0,
                        won,
                      };
                      return { handled: true };
                    }
                  }
                  if (statUpper === "LASTGOAL") {
                    let occurred = false;
                    if (summaryData.lastGoal) {
                      if (summaryData.lastGoal.athleteId)
                        occurred =
                          String(summaryData.lastGoal.athleteId) ===
                          String(athleteId);
                      else if (
                        Array.isArray(summaryData.lastGoal.participants)
                      ) {
                        for (const p of summaryData.lastGoal.participants) {
                          const keys = Object.keys(p || {});
                          if (
                            keys.find((k) => String(k) === String(athleteId))
                          ) {
                            occurred = true;
                            break;
                          }
                        }
                      }
                    }
                    if (bv === "yes" || bv === "no") {
                      let won;
                      if (bv === "yes") {
                        won = occurred
                          ? true
                          : isCompleted
                            ? false
                            : "in progress";
                      } else {
                        won = isCompleted
                          ? !occurred
                          : occurred
                            ? false
                            : "in progress";
                      }
                      playerData.milestones[statUpper] = {
                        bet: betValue,
                        current: occurred ? 1 : 0,
                        won,
                      };
                      return { handled: true };
                    }
                  }
                } catch (e) {
                  return { handled: false };
                }
                return { handled: false };
              };

              const firstLastHandled = handleFirstLast();
              if (firstLastHandled.handled) return;

              // Compute current value
              let current = 0;
              if (statUpper === "PRA") {
                // Handle both array-based stats (with labels) and object-based stats
                let pts = 0,
                  reb = 0,
                  ast = 0;

                if (
                  typeof athlete.stats === "object" &&
                  !Array.isArray(athlete.stats)
                ) {
                  // Stats are an object like { PTS: 31, REB: 13, AST: 1 }
                  pts = parseFloat(athlete.stats.PTS) || 0;
                  reb = parseFloat(athlete.stats.REB) || 0;
                  ast = parseFloat(athlete.stats.AST) || 0;
                } else if (
                  Array.isArray(athlete.stats) &&
                  Array.isArray(labels)
                ) {
                  // Stats are an array indexed by labels
                  const ptsIdx = labels.indexOf("PTS");
                  const rebIdx = labels.indexOf("REB");
                  const astIdx = labels.indexOf("AST");
                  pts =
                    ptsIdx >= 0 ? parseFloat(athlete.stats?.[ptsIdx]) || 0 : 0;
                  reb =
                    rebIdx >= 0 ? parseFloat(athlete.stats?.[rebIdx]) || 0 : 0;
                  ast =
                    astIdx >= 0 ? parseFloat(athlete.stats?.[astIdx]) || 0 : 0;
                }

                current = pts + reb + ast;
                console.log(
                  `[Betslip] PRA hardcoded calculation: pts=${pts}, reb=${reb}, ast=${ast}, sum=${current}`,
                );
              } else if (statUpper === "PPP" || statUpper === "PP") {
                // Power-play points (PPP / PP). Prefer explicit PP stat attached
                // to transformed summaries (out.stats.PP), otherwise attempt
                // to resolve via resolver fallbacks.
                try {
                  let val = 0;
                  // athlete.stats may be object or array
                  if (athlete && typeof athlete.stats === "object") {
                    if (!Array.isArray(athlete.stats)) {
                      val =
                        Number(athlete.stats.PP || athlete.stats.PPP || 0) || 0;
                    } else if (
                      Array.isArray(labels) &&
                      Array.isArray(athlete.stats)
                    ) {
                      const idx = labels.findIndex(
                        (l) =>
                          /^(PP|PPP)$/.test(String(l || "")) ||
                          /power[- ]?play/i.test(String(l || "")),
                      );
                      if (idx >= 0) val = Number(athlete.stats[idx]) || 0;
                    }
                  }
                  if (!val) {
                    // fallback to resolver which may inspect plays or nested shapes
                    try {
                      val =
                        Number(
                          resolvePlayerStatValue(
                            athlete,
                            labels,
                            "PP",
                            explicitSport || "",
                          ),
                        ) || 0;
                    } catch (e) {
                      val = 0;
                    }
                  }
                  current = val;
                } catch (e) {
                  current = 0;
                }
              } else {
                if (statIndex >= 0)
                  current = parseFloat(athlete.stats?.[statIndex]) || 0;
                else {
                  try {
                    current = resolvePlayerStatValue(
                      athlete,
                      labels,
                      statUpper,
                      explicitSport || "",
                    );
                  } catch (e) {
                    current = 0;
                  }
                }
              }

              console.log(
                `[Betslip] Processing bet: ${betKey}, stat: ${statUpper}, current: ${current}, betValue: ${betValue}`,
              );

              if (bv === "yes" || bv === "no") {
                // For GOALS milestone, current is already computed from resolvePlayerStatValue
                // which checks HGL/G/GOAL/GOALS, so we can use it directly
                const occurred = !!current && Number(current) > 0;
                let won;
                if (bv === "yes") {
                  won = occurred ? true : isCompleted ? false : "in progress";
                } else {
                  // bet = "no": only mark won if game is complete
                  won = isCompleted
                    ? !occurred
                    : occurred
                      ? false
                      : "in progress";
                }
                playerData.milestones[statUpper] = {
                  bet: betValue,
                  current: Number(current) || 0,
                  won,
                };
                return;
              }

              // Over/under: accept oNN, uNN, NN+, or NN-
              const bvStr = String(betValue || "").trim();
              const mOU = bvStr.match(/^[ou]([0-9.]+)/i);
              const mPlus = bvStr.match(/^([0-9]+(?:\.[0-9]+)?)\+$/);
              const mMinus = bvStr.match(/^([0-9]+(?:\.[0-9]+)?)-$/);
              if (mOU || mPlus || mMinus) {
                const isOver = mPlus
                  ? true
                  : mMinus
                    ? false
                    : /^o/i.test(bvStr);
                const line = mOU
                  ? parseFloat(mOU[1])
                  : mPlus
                    ? parseFloat(mPlus[1])
                    : parseFloat(mMinus[1]);
                const isInProgress = !isCompleted && gameStatus?.state === "in";
                let won;
                if (isOver) {
                  const isWinning = Number(current) >= line;
                  won = isCompleted
                    ? isWinning
                      ? true
                      : false
                    : isInProgress
                      ? isWinning
                        ? true
                        : "in progress"
                      : "pending";
                } else {
                  const isWinning = Number(current) <= line;
                  if (isInProgress) won = isWinning ? "in progress" : false;
                  else {
                    won = isWinning ? true : false;
                  }
                }
                playerData.overUnder[statUpper] = {
                  bet: line,
                  type: isOver ? "over" : "under",
                  current: current,
                  won,
                };
                return;
              }

              // Check for threshold with optional +/- suffix
              const thresholdStr = String(betValue).trim();
              const thresholdMatch = thresholdStr.match(/^([0-9.]+)([-+]?)$/);
              if (thresholdMatch) {
                const threshold = parseFloat(thresholdMatch[1]);
                const suffix = thresholdMatch[2];
                // If suffix is -, treat as under; otherwise treat as over (default)
                const isOver = suffix !== "-";

                // For 1Q stats, check if Q1 is complete
                let isComplete = isCompleted;
                let isPeriodActive = !isCompleted && gameStatus?.state === "in";
                if (/^1Q/.test(statUpper) && !isCompleted) {
                  // Only check Q1 completion if game is not complete
                  const q1InProgress = isPeriodInProgress(
                    1,
                    linescoresHome,
                    linescoresAway,
                    gameStatus?.state,
                    isCompleted,
                  );
                  isComplete =
                    !q1InProgress &&
                    (linescoresHome[1] !== undefined ||
                      linescoresAway[1] !== undefined);
                  isPeriodActive = q1InProgress;
                }

                let isWinning;
                if (isOver) {
                  isWinning = Number(current) >= threshold;
                } else {
                  isWinning = Number(current) <= threshold;
                }
                playerData.milestones[statUpper] = {
                  bet: betValue,
                  threshold: threshold,
                  current: current,
                  won: isComplete
                    ? isWinning
                      ? true
                      : false
                    : isPeriodActive
                      ? isWinning
                        ? true
                        : "in progress"
                      : "pending",
                };
                return;
              }

              // Fallback: parse numeric threshold (treat as over)
              const threshold = parseFloat(
                String(betValue).replace(/[^0-9.]/g, ""),
              );
              if (!isNaN(threshold)) {
                // For 1Q stats, check if Q1 is complete
                let isComplete = isCompleted;
                let isPeriodActive = !isCompleted && gameStatus?.state === "in";
                if (/^1Q/.test(statUpper) && !isCompleted) {
                  // Only check Q1 completion if game is not complete
                  const q1InProgress = isPeriodInProgress(
                    1,
                    linescoresHome,
                    linescoresAway,
                    gameStatus?.state,
                    isCompleted,
                  );
                  isComplete =
                    !q1InProgress &&
                    (linescoresHome[1] !== undefined ||
                      linescoresAway[1] !== undefined);
                  isPeriodActive = q1InProgress;
                }

                const isWinning = Number(current) >= threshold;
                playerData.milestones[statUpper] = {
                  bet: betValue,
                  threshold: threshold,
                  current: current,
                  won: isComplete
                    ? isWinning
                      ? true
                      : false
                    : isPeriodActive
                      ? isWinning
                        ? true
                        : "in progress"
                      : "pending",
                };
                return;
              }
            });

            // Only add player if they have bets
            if (
              Object.keys(playerData.overUnder).length > 0 ||
              Object.keys(playerData.milestones).length > 0
            )
              players.push(playerData);
            else
              console.log(`[Betslip] Player ${playerId} has no bets processed`);
          }
        });

        if (players.length > 0) {
          eventData.bets.players = players;
        }

        events.push(eventData);
      } catch (gameError) {
        console.error(
          `[Betslip] Error processing game ${rawGameToken}:`,
          gameError.message,
        );
      }
    }

    // Calculate payload size
    const responseString = JSON.stringify(events);
    const payloadSizeBytes = Buffer.byteLength(responseString, "utf8");
    const payloadSizeKB = (payloadSizeBytes / 1024).toFixed(2);

    console.log(
      `[Betslip] Payload size: ${payloadSizeBytes} bytes (${payloadSizeKB} KB)`,
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
          const bets = event.bets || {};

          for (const [key, val] of Object.entries(bets)) {
            if (key === "players" && Array.isArray(val)) {
              count += val.reduce((pSum, p) => {
                const over =
                  p.overUnder && typeof p.overUnder === "object"
                    ? Object.keys(p.overUnder).length
                    : 0;
                const milestones =
                  p.milestones && typeof p.milestones === "object"
                    ? Object.keys(p.milestones).length
                    : 0;
                return pSum + over + milestones;
              }, 0);
            } else if (Array.isArray(val)) {
              count += val.length;
            } else if (val && typeof val === "object") {
              if (Object.keys(val).length > 0) count += 1;
            } else if (val) {
              count += 1;
            }
          }

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
      `[route-alias-local] forwarding POST /api/betslip -> ${localBase}/api/betslips`,
    );
    const resp = await axios.post(`${localBase}/api/betslips`, req.body || {}, {
      headers: { ...(req.headers || {}), host: undefined },
      timeout: 20000,
    });
    return res.status(resp.status).json(resp.data);
  } catch (e) {
    console.error(
      "[route-alias-local] POST /api/betslip forward failed",
      e?.message || e,
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
      `[route-alias-local] forwarding POST /api/betslip/${id}/watch -> ${localBase}/api/betslips/${id}/watch`,
    );
    const resp = await axios.post(
      `${localBase}/api/betslips/${id}/watch`,
      req.body || {},
      {
        headers: { ...(req.headers || {}), host: undefined },
        timeout: 15000,
      },
    );
    return res.status(resp.status).json(resp.data);
  } catch (e) {
    console.error(
      `[route-alias-local] POST /api/betslip/:id/watch forward failed for ${req.params.id}`,
      e?.message || e,
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
      `[route-alias-local] forwarding DELETE /api/betslip/${id}/watch -> ${localBase}/api/betslips/${id}/watch`,
    );
    const resp = await axios.delete(`${localBase}/api/betslips/${id}/watch`, {
      headers: { ...(req.headers || {}), host: undefined },
      timeout: 15000,
    });
    return res.status(resp.status).json(resp.data);
  } catch (e) {
    console.error(
      `[route-alias-local] DELETE /api/betslip/:id/watch forward failed for ${req.params.id}`,
      e?.message || e,
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

  // Start a dedicated 2-hour refresh to keep roster cache in sync with odds.
  // This aligns rosters with SportGameOdds caching cadence.
  if (!rostersScoreboardInterval) {
    console.log(
      "[Rosters Scheduler] Starting 2-hour roster refresh (aligned with SGO polling)",
    );
    rostersScoreboardInterval = setInterval(async () => {
      try {
        console.log(
          "[Rosters Scheduler] Refreshing rosters and scoreboards...",
        );
        // Refresh scoreboard (lightweight) and clear roster cache so next request
        // will rebuild (we keep this non-blocking).
        await fetchScoreboard();
        Object.keys(rosterCache || {}).forEach((k) => delete rosterCache[k]);
        console.log("[Rosters Scheduler] Cleared rosterCache for all sports");
      } catch (err) {
        console.error(
          "[Rosters Scheduler] Error refreshing rosters:",
          err?.message || err,
        );
      }
    }, SGO_CACHE_TTL_MS);
  }

  // Kick off a background rosters/gamelogs fetch on startup so /api/rosters
  // has cached data without requiring a manual request. Run best-effort and
  // do not block server initialization.
  try {
    // Prime rosters for all supported sports in background (non-blocking)
    Object.keys(SGO_LEAGUE_IDS).forEach((sport) => {
      fetchRostersForSport(sport)
        .then(() =>
          console.log(
            `[Rosters] Initial background fetch complete for ${sport}`,
          ),
        )
        .catch((e) =>
          console.warn(
            `[Rosters] Initial fetch failed for ${sport}`,
            e?.message || e,
          ),
        );
    });
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
      e?.message || e,
    );
  }

  // Start SportGameOdds polling (2-hour cadence)
  try {
    scheduleSGOOddsPolling();
  } catch (e) {
    console.warn("Failed to start SportGameOdds polling:", e?.message || e);
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
        { expiresIn: process.env.JWT_EXPIRES_IN || "7d" },
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
  },
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
        !!incomingToken,
      );
      if (incomingToken) {
        try {
          console.log(
            "[auth/login] attempting supabaseAdmin.auth.getUser with masked token",
            `${String(incomingToken).slice(0, 8)}...<masked>`,
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
                },
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
                  { expiresIn: process.env.JWT_EXPIRES_IN || "7d" },
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
                profLookupErr,
              );
            }
          }
        } catch (e) {
          console.error(
            "[auth/login] error resolving supabase token",
            e && e.message ? e.message : e,
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
        user.username,
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
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" },
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
        "Auth: JWT had no userId/profileId; proceeding with null userId",
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
            e?.message || e,
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
          err?.message || err,
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
        upsertErr?.message || upsertErr,
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
          updErr?.message || updErr,
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
  // Track raw event lifecycle state (e.g. 'pre'|'in'|'post') between ticks
  const lastEventRawState = {};
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
                  // preserve authoritative won/current shape from payload
                  won: ev.bets.moneyline.won,
                  current:
                    ev.bets.moneyline &&
                    typeof ev.bets.moneyline.current === "object"
                      ? ev.bets.moneyline.current
                      : {
                          current: ev.bets.moneyline.current,
                          won: ev.bets.moneyline.won,
                        },
                });
              }
              // total points
              if (ev.bets.totalPoints) {
                normalized.push({
                  id: `total:${gid}`,
                  gameId: gid,
                  type: "total",
                  line: ev.bets.totalPoints.line,
                  // keep both top-level won and a structured current for watcher
                  won: ev.bets.totalPoints.won,
                  current:
                    ev.bets.totalPoints.current &&
                    typeof ev.bets.totalPoints.current === "object"
                      ? ev.bets.totalPoints.current
                      : {
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
                  // include authoritative won flag and line info so watcher
                  // can rely on the betslip payload instead of heuristics
                  won: ev.bets.spread.won,
                  line: ev.bets.spread.line,
                  lineDisplay:
                    ev.bets.spread.lineDisplay || ev.bets.spread.lineDisplay,
                  current:
                    ev.bets.spread && typeof ev.bets.spread.current === "object"
                      ? ev.bets.spread.current
                      : {
                          current: ev.bets.spread.current,
                          won: ev.bets.spread.won,
                        },
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
            e?.message || e,
          );
        }
      }
      // fetch summaries
      console.log(
        `[watcher ${betslipId}] tick - bets:${betsArr.length} betslipUrl:${
          betslipUrl ? "yes" : "no"
        }`,
      );
      const summaries = {};
      const summaryBaseMap = {};
      for (const rawEvId of Array.from(
        new Set(betsArr.map((b) => b.gameId || b.game_id).filter(Boolean)),
      )) {
        // Strip _sport suffix from gameId (e.g., "401810365_nba" -> "401810365")
        const evId = String(rawEvId).replace(
          /_(nba|nfl|nhl|mlb|soccer|ncaa|wnba|uefa)$/i,
          "",
        );
        try {
          // try to use sport-specific base if we can infer sport from scoreboardData
          let baseUrl = ESPN_BASE_URL;
          try {
            if (scoreboardData && Array.isArray(scoreboardData.events)) {
              const ev = scoreboardData.events.find(
                (x) => String(x.id) === String(evId),
              );
              const slug = ev?.sport?.slug
                ? String(ev.sport.slug).toLowerCase()
                : null;
              if (slug) {
                if (ESPN_PATHS[slug] && ESPN_PATHS[slug].base)
                  baseUrl = ESPN_PATHS[slug].base;
                else if (slug.includes("football"))
                  baseUrl = ESPN_PATHS["nfl"].base;
                else if (slug.includes("hockey"))
                  baseUrl = ESPN_PATHS["nhl"].base;
                else if (slug.includes("basketball"))
                  baseUrl = ESPN_PATHS["nba"].base;
                else if (slug.includes("soccer"))
                  baseUrl = ESPN_PATHS["uefa"].base;
              }
            }
          } catch (e) {
            /* ignore */
          }
          // Try fetching summary from the chosen baseUrl. If that fails
          // (often because the base was NBA-only), try other known
          // sport-specific bases from `ESPN_PATHS` before giving up.
          let resp = null;
          const triedBases = [];
          const candidateBases = [
            baseUrl,
            ...Object.keys(ESPN_PATHS).map((k) => ESPN_PATHS[k].base),
          ].filter((v, i, a) => v && a.indexOf(v) === i);
          for (const candidateBase of candidateBases) {
            try {
              resp = await axios.get(`${candidateBase}/summary?event=${evId}`);
              if (resp && resp.data) {
                summaries[evId] = resp.data;
                summaryBaseMap[evId] = candidateBase;
                break;
              }
            } catch (err) {
              triedBases.push(candidateBase);
            }
          }
          if (!resp) {
            console.error(
              `summary fetch failed for event ${evId}, tried bases: ${triedBases.join(
                ",",
              )}`,
            );
          }
        } catch (e) {
          console.error("summary fetch", e);
        }
      }
      console.log(
        `[watcher ${betslipId}] summaries fetched: ${Object.keys(
          summaries,
        ).join(",")}`,
      );

      const isFirstTick = Object.keys(lastStates).length === 0;
      let allFinal = true;
      let anyLost = false;
      let anyCompleted = false;
      let anyCompletedNotWon = false;
      let anyDefiniteLoss = false; // any bet where game completed AND pick is lost

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
            // Don't set isCompleted=true: bet can be won while game still in progress
          } else if (
            topWon === false ||
            (typeof topWon === "string" &&
              String(topWon).toLowerCase() === "false")
          ) {
            newState = "lost";
            // Don't set isCompleted=true: bet can be lost while game still in progress
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
              // Don't set isCompleted=true: bet can be won while game still in progress
            } else if (
              curWon === false ||
              (typeof curWon === "string" &&
                String(curWon).toLowerCase() === "false")
            ) {
              newState = "lost";
              // Don't set isCompleted=true: bet can be lost while game still in progress
            } else if (
              typeof curWon === "string" &&
              String(curWon).toLowerCase() === "in progress"
            ) {
              newState = "in progress";
              // Game is still in progress, so definitely not completed
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
                // Don't set isCompleted=true: bet can be won while game still in progress
                break;
              }
              if (entry && entry.won === false) {
                newState = "lost";
                // Don't set isCompleted=true: bet can be lost while game still in progress
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
                // Don't set isCompleted=true: bet can be won while game still in progress
                break;
              }
              if (
                entry &&
                (wonVal === false ||
                  (typeof wonVal === "string" &&
                    String(wonVal).toLowerCase() === "false"))
              ) {
                newState = "lost";
                // Don't set isCompleted=true: bet can be lost while game still in progress
                break;
              }
              if (
                entry &&
                typeof entry.won === "string" &&
                String(entry.won).toLowerCase() === "in progress"
              ) {
                newState = "in progress";
                // Game is still in progress, so definitely not completed
                break;
              }
            }
          }
        } catch (e) {
          console.warn(
            "watcher: error checking stored bet flags",
            e?.message || e,
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

          // If the game is now marked completed by ESPN but the betslip payload
          // still reports "in progress" (it may lag behind the game ending),
          // clear newState so the score-based heuristics below can resolve the
          // correct outcome. Without this, the spread/moneyline heuristic block
          // is skipped (it only runs when newState === null) and allFinal never
          // becomes true, permanently blocking settlement.
          if (isCompleted && newState === "in progress") {
            newState = null;
          }

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

          // Choose an emoji appropriate to the sport for notifications.
          // Prefer the ESPN base URL we successfully used to fetch the
          // summary (e.g. '/sports/football/nfl' -> 🏈). Fall back to
          // `summary.sport.slug` when the base isn't available.
          const usedBase = summaryBaseMap[evId] || "";
          let sportEmoji = "🏀"; // default
          if (usedBase) {
            const ub = String(usedBase).toLowerCase();
            if (ub.includes("/basketball/") || ub.includes("/nba"))
              sportEmoji = "🏀";
            else if (ub.includes("/football/") || ub.includes("/nfl"))
              sportEmoji = "🏈";
            else if (ub.includes("/hockey/") || ub.includes("/nhl"))
              sportEmoji = "🏒";
            else if (ub.includes("/soccer/") || ub.includes("/uefa"))
              sportEmoji = "⚽";
            else if (ub.includes("/baseball/") || ub.includes("/mlb"))
              sportEmoji = "⚾";
            else if (ub.includes("/tennis/")) sportEmoji = "🎾";
            else if (ub.includes("/cricket/")) sportEmoji = "🏏";
            else sportEmoji = "🏟️";
          } else {
            const sportSlugRaw =
              (summary.header?.competitions?.[0]?.sport?.slug ||
                summary.sport?.slug ||
                "") + "";
            const sportSlug = String(sportSlugRaw).toLowerCase();
            if (/basketball|nba/.test(sportSlug)) sportEmoji = "🏀";
            else if (/football|nfl/.test(sportSlug)) sportEmoji = "🏈";
            else if (/hockey|nhl/.test(sportSlug)) sportEmoji = "🏒";
            else if (/soccer|uefa|football\/soccer|fifa/.test(sportSlug))
              sportEmoji = "⚽";
            else if (/baseball|mlb/.test(sportSlug)) sportEmoji = "⚾";
            else if (/tennis/.test(sportSlug)) sportEmoji = "🎾";
            else if (/cricket/.test(sportSlug)) sportEmoji = "🏏";
            else sportEmoji = "🏟️";
          }

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

          // Prefer raw state transitions for start/end notifications to avoid
          // spurious notifications caused by heuristics. Use summary's
          // `status.type.state` when available.
          const newRawState =
            summary.header?.competitions?.[0]?.status?.type?.state || null;
          const prevRawState = lastEventRawState[evId];

          // Notify Game Started when either:
          // - we observe a raw 'pre' -> 'in' transition between ticks, OR
          // - fall back to heuristic (previous textual status != in progress
          //   and current isInProgress) when raw states are not available.
          const startedByTransition =
            !isFirstTick && prevRawState === "pre" && newRawState === "in";
          const startedByHeuristic =
            !isFirstTick &&
            prevEvent !== "in progress" &&
            isInProgress &&
            (prevEvent !== undefined || startedRecently);
          if (startedByTransition || startedByHeuristic) {
            // Avoid spamming the same user about the same event multiple
            // times from different watchers or rapid ticks.
            if (!shouldSuppressNotification(fresh.user_id, evId, "started")) {
              console.log(
                `[watcher ${betslipId}] notify -> Game Started user:${fresh.user_id} event:${evId}`,
              );
              await sendPushNotification(
                fresh.user_id,
                `Game Started ${sportEmoji}`,
                `${homeAbbr} vs ${awayAbbr} has now started`,
                { betslipId: fresh.id, eventId: evId },
              );
            } else {
              console.log(
                `[watcher ${betslipId}] suppressed duplicate Game Started notify -> user:${fresh.user_id} event:${evId}`,
              );
            }
          }

          // Notify Game Ended only when state transitions from 'in' -> 'post'
          // between ticks. This avoids spurious end notifications based on
          // intermediate heuristics. We do not use the startedWithinDay
          // fallback here to ensure ends are genuine transitions.
          if (!isFirstTick && prevRawState === "in" && newRawState === "post") {
            if (!shouldSuppressNotification(fresh.user_id, evId, "ended")) {
              console.log(
                `[watcher ${betslipId}] notify -> Game Ended user:${fresh.user_id} event:${evId}`,
              );
              await sendPushNotification(
                fresh.user_id,
                `Game Ended ${sportEmoji}`,
                `${homeAbbr} ${homeScore} vs ${awayAbbr} ${awayScore} has ended`,
                { betslipId: fresh.id, eventId: evId },
              );
            } else {
              console.log(
                `[watcher ${betslipId}] suppressed duplicate Game Ended notify -> user:${fresh.user_id} event:${evId}`,
              );
            }
          }

          lastEventStatus[evId] = isCompleted
            ? "completed"
            : isInProgress
              ? "in progress"
              : "scheduled";
          // Persist the raw state for next tick comparisons
          if (typeof newRawState === "string")
            lastEventRawState[evId] = newRawState;

          // simplified heuristics (moneyline/total/spread/player)
          // Only compute type-specific heuristics when we don't already
          // have a resolved `newState` from the incoming payload (authoritative).
          if (newState === null && !bet.playerId && !bet.player && !bet.prop) {
            const competitors =
              summary.header?.competitions?.[0]?.competitors || [];
            const betTeam = competitors.find(
              (c) =>
                c.team?.abbreviation ===
                (bet.team || bet.selection || bet.description),
            );
            const opp = competitors.find(
              (c) =>
                c.team?.abbreviation !==
                (bet.team || bet.selection || bet.description),
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
                    String(adjustedRaw).replace(/[^0-9\.-]/g, ""),
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
                } else if (
                  // If the normalized payload exposes a numeric `current` value
                  // (e.g. an adjusted score or margin), use its sign instead of
                  // naively comparing raw team scores. This avoids misclassifying
                  // spread bets when `line` is missing from the payload.
                  typeof bet.current === "number" ||
                  (bet.current && !Number.isNaN(Number(bet.current)))
                ) {
                  const cur = Number(bet.current);
                  isWinning = cur >= 0;
                } else {
                  // Unknown shape: be conservative. If the game is completed
                  // fall back to raw score comparison; otherwise do not claim
                  // the spread as winning while in-progress.
                  isWinning = isCompleted ? betScore > oppScore : false;
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
                } score:${betScore}-${oppScore} isWinning:${isWinning} isInProgress:${isInProgress} isCompleted:${isCompleted} -> newState:${newState}`,
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
                  newState =
                    isCompleted || isInProgress ? "won" : "in progress";
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
              bet,
            )} summaryState:${
              summary?.header?.competitions?.[0]?.status?.type?.state
            }`,
          );
        } catch (e) {}

        // track completion metrics for finalization rule
        if (isCompleted) anyCompleted = true;
        if (isCompleted && newState !== "won") anyCompletedNotWon = true;
        if (isCompleted && newState === "lost") anyDefiniteLoss = true;

        // avoid spamming notifications on the very first tick when watcher starts
        if (lastStates[pickKey] !== newState) {
          if (!isFirstTick) {
            if (newState === "won") {
              console.log(
                `[watcher ${betslipId}] notify -> Pick Won user:${fresh.user_id} pick:${pickKey}`,
              );
            }
            if (newState === "lost") {
              console.log(
                `[watcher ${betslipId}] notify -> Pick Lost user:${fresh.user_id} pick:${pickKey}`,
              );
            }
            if (newState === "in progress") {
              console.log(
                `[watcher ${betslipId}] notify -> Pick In Progress user:${fresh.user_id} pick:${pickKey}`,
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
            if (!hasBets) {
              // If there are no picks for this event, treat it as pending
              // unless we can confidently verify the event is completed.
              // This covers the case where `event` objects in the betslip
              // contain an empty `bets` object (parlay/sgp+ gaps).
              if (!evId) {
                hasPendingEmptyEvents = true;
                break;
              }
              // If we have an event id, try to consult the fetched summaries
              // and ensure the event is completed; otherwise treat as pending.
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

      if (!isFirstTick && anyDefiniteLoss && !hasPendingEmptyEvents) {
        // Ensure betslip payload indicates all bets are present before settling
        const allowSettle = await canSettleFromPayload(fresh, betslipId).catch(
          (e) => {
            console.warn(
              `[watcher ${betslipId}] canSettleFromPayload failed`,
              e?.message || e,
            );
            return true;
          },
        );

        if (!allowSettle) {
          console.log(
            `[watcher ${betslipId}] deferring settlement: payload reports fewer bets than games`,
          );
        }

        if (allowSettle && fresh.status !== "lost") {
          try {
            // Use DB RPC to atomically settle and record ledger/history
            const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc(
              "settle_betslip",
              { p_betslip_id: betslipId, p_result: "lost" },
            );
            if (rpcErr) {
              console.error(
                `[watcher ${betslipId}] settle_betslip RPC error`,
                rpcErr,
              );
              // Fallback: attempt manual settlement using service role
              await manualSettleBetslip(betslipId, "lost");
            } else {
              console.log(
                `[watcher ${betslipId}] settled (lost) via RPC for user:${fresh.user_id}`,
                rpcRes,
              );
            }
            // Use centralized formatter to produce richer notification
            await sendBetResultNotification(betslipId);
          } catch (e) {
            console.error(
              `[watcher ${betslipId}] error while settling lost bet`,
              e?.message || e,
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
        // Ensure betslip payload indicates all bets are present before settling
        const allowSettleFinal = await canSettleFromPayload(
          fresh,
          betslipId,
        ).catch((e) => {
          console.warn(
            `[watcher ${betslipId}] canSettleFromPayload failed (final)`,
            e?.message || e,
          );
          return true;
        });

        if (!allowSettleFinal) {
          console.log(
            `[watcher ${betslipId}] deferring final settlement: payload reports fewer bets than games`,
          );
        }

        if (allowSettleFinal && fresh.status !== newStatus) {
          try {
            const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc(
              "settle_betslip",
              { p_betslip_id: betslipId, p_result: newStatus },
            );
            if (rpcErr) {
              console.error(
                `[watcher ${betslipId}] settle_betslip RPC error`,
                rpcErr,
              );
              // Fallback: attempt manual settlement using service role
              await manualSettleBetslip(betslipId, newStatus);
            } else {
              console.log(
                `[watcher ${betslipId}] settled via RPC -> ${newStatus} user:${fresh.user_id}`,
                rpcRes,
              );
            }
            // send bet result using centralized formatter
            await sendBetResultNotification(betslipId);
          } catch (e) {
            console.error(
              `[watcher ${betslipId}] error while settling bet`,
              e?.message || e,
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

// Check betslip payload to ensure reported totalBets >= gamesCount before settling
async function canSettleFromPayload(fresh, betslipId) {
  try {
    let payload = null;
    const betslipUrl =
      fresh.betslip_url ||
      fresh.betslip_data?.betslip_url ||
      fresh.betslip_data?.betslipUrl ||
      null;

    if (betslipUrl) {
      try {
        const resp = await axios.get(betslipUrl);
        payload = resp.data || null;
      } catch (e) {
        console.warn(
          `[watcher ${betslipId}] failed to fetch betslip_url`,
          e?.message || e,
        );
      }
    }

    if (!payload && fresh.betslip_data) payload = fresh.betslip_data;
    if (!payload) return true; // no payload to check -> allow (preserve existing behavior)

    const meta = payload.metadata || payload.meta || null;
    if (!meta) return true;

    const totalBets =
      typeof meta.totalBets === "number"
        ? meta.totalBets
        : Number(meta.totalBets);
    const gamesCount =
      typeof meta.gamesCount === "number"
        ? meta.gamesCount
        : Number(meta.gamesCount);

    if (!Number.isFinite(totalBets) || !Number.isFinite(gamesCount))
      return true;

    // Ensure payload indicates all bets are present before settling.
    // If there are fewer reported bets than games, the payload is incomplete
    // and we must NOT settle yet.
    if (totalBets < gamesCount) return false;

    // Additionally, scan payload events for explicit `won` flags. If any
    // reported bet has a non-boolean `won` value (e.g. "pending" / null),
    // treat payload as incomplete and do not settle.
    const events =
      payload.events ||
      payload.betslipData?.events ||
      payload.betslip_data?.events ||
      [];
    try {
      for (const ev of events) {
        const bets = ev.bets || {};
        // top-level bet types
        for (const k of Object.keys(bets)) {
          const b = bets[k];
          if (!b) continue;
          // simple shape: { won: ... }
          if (Object.prototype.hasOwnProperty.call(b, "won")) {
            if (typeof b.won !== "boolean") return false;
          }
          // players array shape
          if (Array.isArray(b.players)) {
            for (const p of b.players) {
              // overUnder / milestones nested shapes
              for (const sub of [p.overUnder || {}, p.milestones || {}]) {
                for (const key of Object.keys(sub || {})) {
                  const entry = sub[key];
                  if (
                    entry &&
                    Object.prototype.hasOwnProperty.call(entry, "won")
                  ) {
                    if (typeof entry.won !== "boolean") return false;
                  }
                }
              }
            }
          }
        }
      }
    } catch (e) {
      // if scanning fails, be conservative and disallow settlement
      return false;
    }

    return true;
  } catch (e) {
    console.warn(
      `[canSettleFromPayload] error for ${betslipId}`,
      e?.message || e,
    );
    return true;
  }
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
            e?.message || e,
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
              } title:${title} body:${body} player:${p.id || null}`,
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
              } title:${title} body:${body} player:${p.id || null}`,
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
              `[realtime] betslips INSERT detected id:${id} user:${userId}`,
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
                  e?.message || e,
                );
              }
            }
          } catch (e) {
            console.error("[realtime] payload handling error", e?.message || e);
          }
        },
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
            `[realtime-fallback] initial scan for betslips since ${sinceTime}`,
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
              recentErr.message || recentErr,
            );
          if (recentRows && recentRows.length > 0) {
            for (const r of recentRows) {
              try {
                console.log(
                  `[realtime-fallback] initial scan found betslip id:${r.id} created_at:${r.created_at}`,
                );
                startWatcherInline(r.id);
                if (betslipWatchers[r.id])
                  console.log(
                    `[realtime-fallback] watcher started for ${r.id}`,
                  );
              } catch (e) {
                console.error(
                  `[realtime-fallback] failed to start watcher for ${r.id} during initial scan`,
                  e?.message || e,
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
            e?.message || e,
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
              error.message || error,
            );
          if (rows && rows.length > 0) {
            for (const r of rows) {
              try {
                console.log(
                  `[realtime-fallback] detected new betslip id:${r.id} created_at:${r.created_at}`,
                );
                startWatcherInline(r.id);
                if (betslipWatchers[r.id])
                  console.log(
                    `[realtime-fallback] watcher started for ${r.id}`,
                  );
              } catch (e) {
                console.error(
                  `[realtime-fallback] failed to start watcher for ${r.id}`,
                  e?.message || e,
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
            "[realtime] subscription timed out — enabling fallback polling",
          );
          startRealtimeFallback();
        } else {
          // any successful status -> stop fallback if running
          stopRealtimeFallback();
        }
      } catch (e) {
        console.error(
          "[realtime] subscription status handler error",
          e?.message || e,
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
      Date.now() - lookbackDays * 24 * 60 * 60 * 1000,
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
            `[watcher] seeded watcher for ${r.id} created_at:${r.created_at}`,
          );
        else console.warn(`[watcher] failed to seed watcher for ${r.id}`);
      } catch (e) {
        console.error(
          `[watcher] error seeding watcher for ${r.id}`,
          e?.message || e,
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
      (Math.round((newCredits + Number.EPSILON) * 100) / 100).toFixed(2),
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
          ((totalStake || 0) * totalDecimal).toFixed(2),
        );
      }
    } catch (e) {
      console.warn(
        "[betslips] failed to compute potentialPayout server-side",
        e?.message || e,
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
        `[betslips] watcher not found after start attempt for ${inserted.id}`,
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
        e?.message || e,
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
              first.team || first.selection || first.teamCode,
            );
          }
          betslipUrl = `${baseApi.replace(
            /\/$/,
            "",
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
            `[betslips] persisted betslip_url for ${inserted.id}: ${betslipUrl}`,
          );
        }
      } catch (e) {
        console.warn(
          "Failed to persist betslip_url for",
          inserted.id,
          e?.message || e,
        );
      }
    } catch (e) {
      console.warn(
        "Failed to persist betslip_url for",
        inserted.id,
        e?.message || e,
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
          }`,
        );
        await sendPushNotification(
          profileId,
          body.title || "Test",
          body.body || "This is a test notification",
          body.data || {},
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
      `[api/watch] startWatcherInline called for ${id} by user ${req.userId}`,
    );
    if (betslipWatchers[id]) {
      console.log(`[api/watch] watcher active for ${id}`);
      return res.json({ message: "Watcher started" });
    }
    console.warn(
      `[api/watch] watcher start call returned but watcher not active for ${id}`,
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
      }`,
    );
    await sendPushNotification(
      profileId,
      title || "Test",
      bodyText || "Test push",
      data || {},
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
        "REVENUECAT_WEBHOOK_SECRET not set; skipping signature verification",
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
        e?.message || e,
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
            e?.message || e,
          );
        }
      }
    } catch (e) {
      console.warn(
        "RevenueCat webhook profile link attempt failed",
        e?.message || e,
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
    // Use case-insensitive lookup to tolerate user input casing/spacing
    const { data: promoRows, error: promoErr } = await supabaseAdmin
      .from("promo_codes")
      .select("code, uses, max_uses, expires_at, type, metadata")
      .ilike("code", code)
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
        .select("id, is_pro, pro_expires_at")
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

    if (profileRow && isActivePro(profileRow)) {
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
        `[api/watch] stopped watcher for ${id} by user ${req.userId}`,
      );
      res.json({ watching: false });
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "Server error" });
    }
  },
);

// --------------------------
// Simple admin error CRUD endpoints
// --------------------------
app.get("/api/error", async (req, res) => {
  try {
    // return newest first
    const list = (adminErrors || [])
      .slice()
      .sort((a, b) => (b.ts || 0) - (a.ts || 0));
    res.json({ errors: list });
  } catch (e) {
    console.error("/api/error GET failed", e);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/error", async (req, res) => {
  try {
    const { code, header, message, status, ts } = req.body || {};
    if (!header || !message)
      return res.status(400).json({ message: "header and message required" });
    const entry = {
      id: String(adminErrorNextId++),
      code: code || null,
      header,
      message,
      status: status || "yellow",
      ts: Number(ts) || Date.now(),
    };
    adminErrors.push(entry);
    res.json(entry);
  } catch (e) {
    console.error("/api/error POST failed", e);
    res.status(500).json({ message: "Server error" });
  }
});

app.put("/api/error/:id", async (req, res) => {
  try {
    const id = String(req.params.id);
    const idx = adminErrors.findIndex((e) => String(e.id) === id);
    if (idx === -1) return res.status(404).json({ message: "not found" });
    const { header, message, status } = req.body || {};
    if (header != null) adminErrors[idx].header = header;
    if (message != null) adminErrors[idx].message = message;
    if (status != null) adminErrors[idx].status = status;
    adminErrors[idx].ts = Date.now();
    res.json(adminErrors[idx]);
  } catch (e) {
    console.error("/api/error PUT failed", e);
    res.status(500).json({ message: "Server error" });
  }
});

app.delete("/api/error/:id", async (req, res) => {
  try {
    const id = String(req.params.id);
    const before = adminErrors.length;
    adminErrors = adminErrors.filter((e) => String(e.id) !== id);
    res.json({ deleted: before - adminErrors.length });
  } catch (e) {
    console.error("/api/error DELETE failed", e);
    res.status(500).json({ message: "Server error" });
  }
});

// Admin code verification endpoint. Returns "Access Granted" when code matches, otherwise empty body.
app.get("/error_admin/:code", (req, res) => {
  try {
    const provided = String(req.params.code || "");
    const expected = process.env.ADMIN_CODE || null;
    if (expected && provided === String(expected)) {
      return res.status(200).send("Access Granted");
    }
    return res.status(200).send("");
  } catch (e) {
    console.error("/error_admin/:code failed", e);
    return res.status(500).send("");
  }
});

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

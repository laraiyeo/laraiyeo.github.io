const { Expo } = require("expo-server-sdk");
const pool = require("../db/database");

const expo = new Expo();

async function sendPushNotification(userId, title, body, data = {}) {
  try {
    // Get user's push token
    // First try users.push_token (legacy), then fallback to push_tokens table (client upserts here)
    let pushToken = null;
    try {
      const r = await pool.query("SELECT push_token FROM users WHERE id = $1", [
        userId,
      ]);
      if (r.rows.length > 0 && r.rows[0].push_token)
        pushToken = r.rows[0].push_token;
    } catch (e) {
      console.error("Error querying users.push_token", e?.message || e);
    }

    if (!pushToken) {
      try {
        const r2 = await pool.query(
          "SELECT expo_push_token FROM push_tokens WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1",
          [userId]
        );
        if (r2.rows.length > 0 && r2.rows[0].expo_push_token)
          pushToken = r2.rows[0].expo_push_token;
      } catch (e) {
        console.error("Error querying push_tokens table", e?.message || e);
      }
    }

    if (!pushToken) {
      console.log("No push token found for user:", userId);
      return;
    }

    // Check if token is valid
    if (!Expo.isExpoPushToken(pushToken)) {
      console.error("Invalid Expo push token:", pushToken);
      return;
    }

    // Create message
    const message = {
      to: pushToken,
      sound: "default",
      title,
      body,
      data,
      priority: "high",
    };

    // Send notification
    const chunks = expo.chunkPushNotifications([message]);
    const tickets = [];

    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      } catch (error) {
        console.error("Error sending chunk:", error);
      }
    }

    // Save notification to database
    await pool.query(
      "INSERT INTO push_notifications (user_id, title, body, data) VALUES ($1, $2, $3, $4)",
      [userId, title, body, JSON.stringify(data)]
    );

    console.log("Notification sent to user:", userId);
    return tickets;
  } catch (error) {
    console.error("Push notification error:", error);
  }
}

async function sendBetResultNotification(betslipId) {
  try {
    const result = await pool.query(
      "SELECT b.*, u.id as user_id FROM betslips b JOIN users u ON b.user_id = u.id WHERE b.id = $1",
      [betslipId]
    );

    if (result.rows.length === 0) return;

    const betslip = result.rows[0];
    const status = betslip.status;

    let title, body;
    if (status === "won") {
      title = "🎉 Bet Won!";
      body = `Your bet has won! You've earned ${betslip.potential_payout} credits.`;
    } else if (status === "lost") {
      title = "😔 Bet Lost";
      body = `Unfortunately, your bet didn't win this time.`;
    }

    await sendPushNotification(betslip.user_id, title, body, {
      betslipId,
      status,
    });
  } catch (error) {
    console.error("Bet result notification error:", error);
  }
}

// Send a push to a single Expo token (no DB user association)
async function sendPushToToken(pushToken, title, body, data = {}) {
  try {
    if (!Expo.isExpoPushToken(pushToken)) {
      console.error("Invalid Expo push token:", pushToken);
      return;
    }

    const message = {
      to: pushToken,
      sound: "default",
      title,
      body,
      data,
      priority: "high",
    };

    const chunks = expo.chunkPushNotifications([message]);
    for (const chunk of chunks) {
      try {
        await expo.sendPushNotificationsAsync(chunk);
      } catch (err) {
        console.error("Error sending push chunk:", err);
      }
    }
    return true;
  } catch (e) {
    console.error("sendPushToToken error", e);
  }
}

// Broadcast a message to all stored push tokens
async function broadcastToAll(title, body, data = {}) {
  try {
    const r = await pool.query(
      "SELECT expo_push_token FROM push_tokens WHERE expo_push_token IS NOT NULL"
    );
    const tokens = r.rows.map((row) => row.expo_push_token).filter(Boolean);
    if (tokens.length === 0) {
      console.log("No push tokens to broadcast to");
      return;
    }

    // Chunk messages for expo
    const messages = tokens.map((t) => ({
      to: t,
      sound: "default",
      title,
      body,
      data,
      priority: "high",
    }));
    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      try {
        await expo.sendPushNotificationsAsync(chunk);
      } catch (err) {
        console.error("Error broadcasting chunk:", err);
      }
    }

    // Optionally record broadcast in DB (no user_id)
    await pool.query(
      "INSERT INTO push_notifications (title, body, data) VALUES ($1, $2, $3)",
      [title, body, JSON.stringify(data)]
    );
    console.log("Broadcast sent to", tokens.length, "tokens");
  } catch (e) {
    console.error("broadcastToAll error", e);
  }
}

module.exports = {
  sendPushNotification,
  sendBetResultNotification,
  sendPushToToken,
  broadcastToAll,
};

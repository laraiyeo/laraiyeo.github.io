const { Expo } = require('expo-server-sdk');
const pool = require('../db/database');

const expo = new Expo();

async function sendPushNotification(userId, title, body, data = {}) {
  try {
    // Get user's push token
    const result = await pool.query(
      'SELECT push_token FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0 || !result.rows[0].push_token) {
      console.log('No push token found for user:', userId);
      return;
    }

    const pushToken = result.rows[0].push_token;

    // Check if token is valid
    if (!Expo.isExpoPushToken(pushToken)) {
      console.error('Invalid Expo push token:', pushToken);
      return;
    }

    // Create message
    const message = {
      to: pushToken,
      sound: 'default',
      title,
      body,
      data,
      priority: 'high',
    };

    // Send notification
    const chunks = expo.chunkPushNotifications([message]);
    const tickets = [];

    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      } catch (error) {
        console.error('Error sending chunk:', error);
      }
    }

    // Save notification to database
    await pool.query(
      'INSERT INTO push_notifications (user_id, title, body, data) VALUES ($1, $2, $3, $4)',
      [userId, title, body, JSON.stringify(data)]
    );

    console.log('Notification sent to user:', userId);
    return tickets;
  } catch (error) {
    console.error('Push notification error:', error);
  }
}

async function sendBetResultNotification(betslipId) {
  try {
    const result = await pool.query(
      'SELECT b.*, u.id as user_id FROM betslips b JOIN users u ON b.user_id = u.id WHERE b.id = $1',
      [betslipId]
    );

    if (result.rows.length === 0) return;

    const betslip = result.rows[0];
    const status = betslip.status;

    let title, body;
    if (status === 'won') {
      title = '🎉 Bet Won!';
      body = `Your bet has won! You've earned ${betslip.potential_payout} credits.`;
    } else if (status === 'lost') {
      title = '😔 Bet Lost';
      body = `Unfortunately, your bet didn't win this time.`;
    }

    await sendPushNotification(betslip.user_id, title, body, {
      betslipId,
      status,
    });
  } catch (error) {
    console.error('Bet result notification error:', error);
  }
}

module.exports = {
  sendPushNotification,
  sendBetResultNotification,
};

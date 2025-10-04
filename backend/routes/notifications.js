const express = require('express');
const router = express.Router();
const webpush = require('web-push');
const { getCachedData, setCachedData, generateCacheKey } = require('../services/cacheService');

// Configure web-push with VAPID keys if available. If VAPID vars are missing,
// skip initialization so the app can still start (push endpoints will return 503).
let webpushEnabled = true;
const vapidPublic = process.env.VAPID_PUBLIC_KEY;
const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT || process.env.VAPID_EMAIL;

if (vapidPublic && vapidPrivate && vapidSubject) {
  try {
    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
  } catch (err) {
    console.error('Error configuring web-push VAPID keys:', err);
    webpushEnabled = false;
  }
} else {
  webpushEnabled = false;
  console.warn('web-push not configured: missing VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY or VAPID_SUBJECT/VAPID_EMAIL');
}

/**
 * POST /api/notifications/subscribe/:userId
 * Subscribe user to push notifications
 */
router.post('/subscribe/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { subscription, preferences } = req.body;

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Invalid subscription object' });
    }

    // Store subscription with user preferences
    const subscriptionData = {
      userId,
      subscription,
      preferences: preferences || {
        gameStart: true,
        scoreUpdate: true,
        gameEnd: true,
        news: false
      },
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString()
    };

    const cacheKey = generateCacheKey('push_subscription', userId);
    await setCachedData(cacheKey, subscriptionData, 86400 * 30); // Cache for 30 days

    res.json({ success: true, message: 'Subscription saved successfully' });
  } catch (error) {
    console.error('Error saving push subscription:', error);
    res.status(500).json({ error: 'Failed to save subscription' });
  }
});

/**
 * PUT /api/notifications/preferences/:userId
 * Update notification preferences
 */
router.put('/preferences/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { preferences } = req.body;

    const cacheKey = generateCacheKey('push_subscription', userId);
    const subscriptionData = await getCachedData(cacheKey);

    if (!subscriptionData) {
      return res.status(404).json({ error: 'No subscription found for user' });
    }

    subscriptionData.preferences = {
      ...subscriptionData.preferences,
      ...preferences
    };
    subscriptionData.lastUsed = new Date().toISOString();

    await setCachedData(cacheKey, subscriptionData, 86400 * 30);

    res.json({ success: true, preferences: subscriptionData.preferences });
  } catch (error) {
    console.error('Error updating notification preferences:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

/**
 * POST /api/notifications/send/:userId
 * Send a test notification to user
 */
router.post('/send/:userId', async (req, res) => {
  try {
    if (!webpushEnabled) {
      return res.status(503).json({ error: 'Push notifications not configured on server' });
    }
    const { userId } = req.params;
    const { title, body, data } = req.body;

    const cacheKey = generateCacheKey('push_subscription', userId);
    const subscriptionData = await getCachedData(cacheKey);

    if (!subscriptionData) {
      return res.status(404).json({ error: 'No subscription found for user' });
    }

    const payload = JSON.stringify({
      title: title || 'Sports Tracker',
      body: body || 'Test notification',
      icon: '/icon-192x192.png',
      badge: '/badge-72x72.png',
      data: data || {}
    });

    await webpush.sendNotification(subscriptionData.subscription, payload);

    // Update last used timestamp
    subscriptionData.lastUsed = new Date().toISOString();
    await setCachedData(cacheKey, subscriptionData, 86400 * 30);

    res.json({ success: true, message: 'Notification sent successfully' });
  } catch (error) {
    console.error('Error sending notification:', error);
    
    // Handle subscription errors (expired, invalid, etc.)
    if (error.statusCode === 410 || error.statusCode === 404) {
      // Remove invalid subscription
      const cacheKey = generateCacheKey('push_subscription', req.params.userId);
      await setCachedData(cacheKey, null, 0);
      return res.status(410).json({ error: 'Subscription expired or invalid' });
    }

    res.status(500).json({ error: 'Failed to send notification' });
  }
});

/**
 * DELETE /api/notifications/unsubscribe/:userId
 * Unsubscribe user from push notifications
 */
router.delete('/unsubscribe/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const cacheKey = generateCacheKey('push_subscription', userId);
    await setCachedData(cacheKey, null, 0); // Delete subscription

    res.json({ success: true, message: 'Unsubscribed successfully' });
  } catch (error) {
    console.error('Error unsubscribing:', error);
    res.status(500).json({ error: 'Failed to unsubscribe' });
  }
});

/**
 * GET /api/notifications/vapid-public-key
 * Get VAPID public key for client-side subscription
 */
router.get('/vapid-public-key', (req, res) => {
  if (!webpushEnabled) {
    return res.status(503).json({ error: 'VAPID keys not configured' });
  }
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

module.exports = router;
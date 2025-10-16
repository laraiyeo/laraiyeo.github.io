const webpush = require('web-push');
const { getCachedData, setCachedData, generateCacheKey } = require('./cacheService');

// Normalize and initialize VAPID details if possible (similar logic to notifications route)
let webpushEnabled = true;
const vapidPublic = process.env.VAPID_PUBLIC_KEY;
const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
let vapidSubject = process.env.VAPID_SUBJECT || process.env.VAPID_EMAIL;

function normalizeVapidSubject(subject) {
  if (!subject) return null;
  const lower = subject.toLowerCase();
  if (lower.startsWith('mailto:') || lower.startsWith('http://') || lower.startsWith('https://')) {
    return subject;
  }
  const emailLike = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  if (emailLike.test(subject)) {
    return `mailto:${subject}`;
  }
  return null;
}

const normalizedSubject = normalizeVapidSubject(vapidSubject);

if (vapidPublic && vapidPrivate && normalizedSubject) {
  try {
    webpush.setVapidDetails(normalizedSubject, vapidPublic, vapidPrivate);
    webpushEnabled = true;
    console.log('web-push initialized in notificationService');
  } catch (err) {
    console.error('web-push VAPID initialization failed in notificationService:', err.message || err);
    webpushEnabled = false;
  }
} else {
  webpushEnabled = false;
  console.warn('web-push not enabled in notificationService (missing or invalid VAPID vars)');
}

async function sendNotification(userId, notification) {
  try {
    const cacheKey = generateCacheKey('push_subscription', userId);
    const subscriptionData = await getCachedData(cacheKey);

    if (!subscriptionData || !subscriptionData.subscription) {
      console.log(`No push subscription found for user ${userId}`);
      return { success: false, reason: 'no-subscription' };
    }

    if (!webpushEnabled) {
      console.log('Web-push not enabled; skipping sendNotification');
      return { success: false, reason: 'webpush-disabled' };
    }

    const payload = JSON.stringify({
      title: notification.title || 'Sports Tracker',
      body: notification.body || '',
      icon: notification.icon || '/icon-192x192.png',
      badge: notification.badge || '/badge-72x72.png',
      data: notification.data || {}
    });

    try {
      await webpush.sendNotification(subscriptionData.subscription, payload);
      // update lastUsed timestamp
      subscriptionData.lastUsed = new Date().toISOString();
      await setCachedData(cacheKey, subscriptionData, 86400 * 30);
      return { success: true };
    } catch (err) {
      console.error(`Error sending push to user ${userId}:`, err.stack || err.message || err);
      // Remove expired/invalid subscriptions
      if (err && (err.statusCode === 410 || err.statusCode === 404)) {
        await setCachedData(cacheKey, null, 0);
        return { success: false, reason: 'subscription-expired' };
      }
      return { success: false, reason: 'send-failed', error: err };
    }
  } catch (err) {
    console.error('notificationService.sendNotification unexpected error:', err);
    return { success: false, reason: 'unexpected-error', error: err };
  }
}

module.exports = {
  sendNotification,
  webpushEnabled: () => webpushEnabled
};

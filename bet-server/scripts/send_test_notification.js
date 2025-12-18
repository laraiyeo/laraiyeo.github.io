#!/usr/bin/env node
// Usage: node send_test_notification.js <userId> "Title" "Body"
require('dotenv').config();
const { sendPushNotification } = require('../services/pushNotifications');

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.error('Usage: node send_test_notification.js <userId> "Title" "Body"');
    process.exit(1);
  }
  const [userId, title, body] = args;
  try {
    await sendPushNotification(userId, title, body, { test: true });
    console.log('Test notification attempted for user', userId);
    process.exit(0);
  } catch (e) {
    console.error('Error sending test notification:', e.message || e);
    process.exit(2);
  }
}

main();

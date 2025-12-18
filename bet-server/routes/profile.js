const express = require('express');
const pool = require('../db/database');
const auth = require('../middleware/auth');

const router = express.Router();

// Upsert push token for authenticated user
router.post('/push-token', auth, async (req, res) => {
  try {
    const { pushToken, platform } = req.body;
    if (!pushToken) return res.status(400).json({ message: 'pushToken required' });

    // Upsert into push_tokens table
    await pool.query(
      `INSERT INTO push_tokens (user_id, expo_push_token, platform, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       ON CONFLICT (user_id) DO UPDATE SET expo_push_token = EXCLUDED.expo_push_token, platform = EXCLUDED.platform, updated_at = NOW()` ,
      [req.userId, pushToken, platform || null]
    );

    res.json({ success: true });
  } catch (e) {
    console.error('push-token upsert error', e.message || e);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

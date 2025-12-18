# Betting Authentication & Database Setup Guide

## 📋 Overview
This guide provides step-by-step instructions for setting up a complete authentication system for the betting feature, including user management, credit system, betslip storage, and push notifications.

---

## 🗄️ Database Setup

### Option 1: PostgreSQL (Recommended for Production)

#### Step 1: Choose a PostgreSQL Provider
- **Railway** (Already using): Free tier, easy to set up
- **Supabase**: Free tier with additional features
- **Neon**: Serverless PostgreSQL
- **Heroku**: Free tier available

#### Step 2: Create Database on Railway
1. Go to https://railway.app
2. Create a new project
3. Click "New" → "Database" → "PostgreSQL"
4. Save the connection credentials

#### Step 3: Database Schema
```sql
-- Users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    credits DECIMAL(10, 2) DEFAULT 1000.00,
    push_token VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Betslips table
CREATE TABLE betslips (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    betslip_data JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'pending', -- pending, won, lost
    total_stake DECIMAL(10, 2) NOT NULL,
    potential_payout DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    settled_at TIMESTAMP
);

-- Bet history table
CREATE TABLE bet_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    betslip_id INTEGER REFERENCES betslips(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL, -- placed, won, lost, cancelled
    credits_change DECIMAL(10, 2),
    credits_after DECIMAL(10, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Push notifications table
CREATE TABLE push_notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    data JSONB,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    read BOOLEAN DEFAULT FALSE
);

-- Indexes for performance
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_betslips_user_id ON betslips(user_id);
CREATE INDEX idx_betslips_status ON betslips(status);
CREATE INDEX idx_bet_history_user_id ON bet_history(user_id);
CREATE INDEX idx_push_notifications_user_id ON push_notifications(user_id);
```

---

## 🔧 Backend API Setup

### Step 1: Update Your Railway Backend

Navigate to your backend folder and install required packages:

```bash
cd backend
npm install bcrypt jsonwebtoken pg dotenv express-validator
```

### Step 2: Environment Variables

Create/update `backend/.env`:
```env
# Database
DATABASE_URL=postgresql://user:password@host:port/database

# JWT Secret (generate a random string)
JWT_SECRET=your-super-secret-key-change-this-in-production

# JWT Expiry
JWT_EXPIRES_IN=7d

# Expo Push Notification
EXPO_ACCESS_TOKEN=your-expo-access-token
```

### Step 3: Create Database Connection

Create `backend/db/database.js`:
```javascript
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test connection
pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

module.exports = pool;
```

### Step 4: Create Authentication Middleware

Create `backend/middleware/auth.js`:
```javascript
const jwt = require('jsonwebtoken');

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    req.username = decoded.username;
    
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};

module.exports = authMiddleware;
```

### Step 5: Create Auth Routes

Create `backend/routes/auth.js`:
```javascript
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const pool = require('../db/database');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Signup
router.post(
  '/signup',
  [
    body('username').isLength({ min: 3 }).trim().escape(),
    body('password').isLength({ min: 6 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { username, password, credits = 1000 } = req.body;

      // Check if user exists
      const existingUser = await pool.query(
        'SELECT id FROM users WHERE username = $1',
        [username]
      );

      if (existingUser.rows.length > 0) {
        return res.status(400).json({ message: 'Username already exists' });
      }

      // Hash password
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      // Create user
      const result = await pool.query(
        'INSERT INTO users (username, password_hash, credits) VALUES ($1, $2, $3) RETURNING id, username, credits, created_at',
        [username, passwordHash, credits]
      );

      const user = result.rows[0];

      // Generate JWT token
      const token = jwt.sign(
        { userId: user.id, username: user.username },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      res.status(201).json({
        message: 'User created successfully',
        user: {
          id: user.id,
          username: user.username,
          credits: user.credits,
        },
        token,
      });
    } catch (error) {
      console.error('Signup error:', error);
      res.status(500).json({ message: 'Server error during signup' });
    }
  }
);

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Get user
    const result = await pool.query(
      'SELECT id, username, password_hash, credits FROM users WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = result.rows[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid password' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        credits: user.credits,
      },
      token,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// Verify token
router.post('/verify', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, credits FROM users WHERE id = $1',
      [req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      user: result.rows[0],
    });
  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, credits, created_at FROM users WHERE id = $1',
      [req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update push token
router.post('/push-token', authMiddleware, async (req, res) => {
  try {
    const { pushToken } = req.body;

    await pool.query(
      'UPDATE users SET push_token = $1 WHERE id = $2',
      [pushToken, req.userId]
    );

    res.json({ message: 'Push token updated' });
  } catch (error) {
    console.error('Push token error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
```

### Step 6: Create Betslip Routes

Create `backend/routes/betslips.js`:
```javascript
const express = require('express');
const pool = require('../db/database');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Place a bet
router.post('/', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const { betslipData, totalStake, potentialPayout } = req.body;

    // Check if user has enough credits
    const userResult = await client.query(
      'SELECT credits FROM users WHERE id = $1',
      [req.userId]
    );

    const currentCredits = parseFloat(userResult.rows[0].credits);

    if (currentCredits < totalStake) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Insufficient credits' });
    }

    // Deduct credits
    const newCredits = currentCredits - totalStake;
    await client.query(
      'UPDATE users SET credits = $1 WHERE id = $2',
      [newCredits, req.userId]
    );

    // Create betslip
    const betslipResult = await client.query(
      'INSERT INTO betslips (user_id, betslip_data, total_stake, potential_payout) VALUES ($1, $2, $3, $4) RETURNING id',
      [req.userId, JSON.stringify(betslipData), totalStake, potentialPayout]
    );

    const betslipId = betslipResult.rows[0].id;

    // Record in history
    await client.query(
      'INSERT INTO bet_history (user_id, betslip_id, action, credits_change, credits_after) VALUES ($1, $2, $3, $4, $5)',
      [req.userId, betslipId, 'placed', -totalStake, newCredits]
    );

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Bet placed successfully',
      betslipId,
      creditsRemaining: newCredits,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Place bet error:', error);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

// Get user betslips
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM betslips WHERE user_id = $1 ORDER BY created_at DESC',
      [req.userId]
    );

    res.json({ betslips: result.rows });
  } catch (error) {
    console.error('Get betslips error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single betslip
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM betslips WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Betslip not found' });
    }

    res.json({ betslip: result.rows[0] });
  } catch (error) {
    console.error('Get betslip error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
```

### Step 7: Update `backend/server.js`

Add these lines to your server.js:
```javascript
const authRoutes = require('./routes/auth');
const betslipRoutes = require('./routes/betslips');

// Add routes
app.use('/api/auth', authRoutes);
app.use('/api/betslips', betslipRoutes);
```

---

## 📱 Push Notifications Setup

### Step 1: Install Expo Notifications

In your React Native app:
```bash
cd SportsTrackerExpo
npx expo install expo-notifications expo-device expo-constants
```

### Step 2: Create Notification Service

Create `SportsTrackerExpo/src/services/notificationService.js`:
```javascript
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = 'https://laraiyeogithubio-production-f5af.up.railway.app/api';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export const registerForPushNotifications = async () => {
  let token;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      alert('Failed to get push token for push notification!');
      return;
    }
    
    token = (await Notifications.getExpoPushTokenAsync({
      projectId: Constants.expoConfig.extra.eas.projectId,
    })).data;
    
    console.log('Push token:', token);

    // Save token to backend
    try {
      const authToken = await AsyncStorage.getItem('@bet_token');
      if (authToken) {
        await fetch(`${API_URL}/auth/push-token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ pushToken: token }),
        });
      }
    } catch (error) {
      console.error('Error saving push token:', error);
    }
  } else {
    alert('Must use physical device for Push Notifications');
  }

  return token;
};

export const scheduleNotification = async (title, body, data, seconds = 1) => {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      sound: true,
    },
    trigger: { seconds },
  });
};
```

### Step 3: Create Backend Push Notification Service

Create `backend/services/pushNotifications.js`:
```javascript
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
```

### Step 4: Install Expo Server SDK in Backend

```bash
cd backend
npm install expo-server-sdk
```

---

## 🚀 Deployment Steps

### 1. Database
- ✅ Create PostgreSQL database on Railway
- ✅ Run schema SQL to create tables
- ✅ Save database URL to environment variables

### 2. Backend
- ✅ Add all new routes and services
- ✅ Update environment variables
- ✅ Deploy to Railway (it auto-deploys on git push)

### 3. Frontend
- ✅ BetLoginScreen updated with auth
- ✅ AsyncStorage installed
- ✅ Notification service created
- ⚠️ Update API_URL in BetLoginScreen.js to your Railway URL

### 4. Testing
- Test signup flow
- Test login flow
- Test auto-login
- Test credential persistence
- Test push notifications

---

## 🔐 Security Best Practices

1. **Never store plain passwords** - Always hash with bcrypt
2. **Use HTTPS only** - Railway provides this automatically
3. **Use environment variables** - Never commit secrets
4. **Validate all inputs** - Use express-validator
5. **Implement rate limiting** - Prevent brute force attacks
6. **Use secure JWT secrets** - Generate strong random strings
7. **Set appropriate token expiry** - 7 days is reasonable

---

## 📊 Next Steps

1. **Create User Context** - Store user data globally in React Native
2. **Add Credit Management** - UI for viewing/managing credits
3. **Bet Settlement System** - Automatically settle bets based on game results
4. **Transaction History** - Show all bets and credit changes
5. **Leaderboard** - Show top users by credits or wins
6. **Social Features** - Share betslips with friends
7. **Bonus System** - Daily login bonuses, referral bonuses

---

## 🆘 Troubleshooting

### Issue: "Cannot connect to database"
- Check DATABASE_URL in .env
- Verify Railway database is running
- Check SSL configuration

### Issue: "JWT token invalid"
- Verify JWT_SECRET matches between signup and login
- Check token expiry settings
- Clear AsyncStorage and try again

### Issue: "Push notifications not working"
- Verify using physical device (not emulator)
- Check permissions are granted
- Verify push token is saved to database
- Check Expo project ID in app.json

---

## 📝 Important Files Created/Modified

- ✅ `BetLoginScreen.js` - Updated with auth
- 📁 `backend/routes/auth.js` - New file
- 📁 `backend/routes/betslips.js` - New file
- 📁 `backend/middleware/auth.js` - New file
- 📁 `backend/db/database.js` - New file
- 📁 `backend/services/pushNotifications.js` - New file
- 📁 `SportsTrackerExpo/src/services/notificationService.js` - New file

---

## 💡 Quick Start Command Summary

```bash
# Backend setup
cd backend
npm install bcrypt jsonwebtoken pg dotenv express-validator expo-server-sdk

# Frontend setup
cd ../SportsTrackerExpo
npm install @react-native-async-storage/async-storage
npx expo install expo-notifications expo-device expo-constants

# Create database tables (run SQL in Railway dashboard)
# Update environment variables
# Deploy backend to Railway
# Test the app!
```

---

Good luck with your betting system! 🎰

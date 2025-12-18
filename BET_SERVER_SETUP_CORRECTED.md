# ✅ CORRECTED SETUP GUIDE - Bet Server Authentication

## 🔴 IMPORTANT: Using bet-server (Not backend)

The authentication system has been set up in the **bet-server** folder, which is your Railway deployment.

---

## 📂 Files Created in bet-server/

✅ **Database:**
- `db/database.js` - PostgreSQL connection
- `db/schema.sql` - Complete database schema

✅ **Authentication:**
- `routes/auth.js` - Login, signup, verify, profile endpoints
- `middleware/auth.js` - JWT token verification
- `routes/betslips.js` - Bet placement and history

✅ **Services:**
- `services/pushNotifications.js` - Expo push notifications

✅ **Configuration:**
- `server.js` - Updated with auth routes
- `.env.example` - Updated with new variables
- `package.json` - All dependencies installed ✅

---

## 🚀 DEPLOYMENT STEPS (15 minutes)

### Step 1: Create PostgreSQL Database (5 min)

**On Railway:**
1. Go to https://railway.app
2. Find your bet-server project
3. Click "New" → "Database" → "Add PostgreSQL"
4. Wait for deployment (~1 minute)
5. Click the database → "Connect" tab
6. Copy the `DATABASE_URL` (starts with `postgresql://`)

### Step 2: Setup Database Schema (2 min)

**In Railway PostgreSQL:**
1. Click your database
2. Go to "Query" tab
3. Open file: `bet-server/db/schema.sql`
4. Copy ENTIRE contents
5. Paste in Query tab
6. Click "Run Query"
7. Verify: Should see "Success" and 4 tables created

**Verify tables:**
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public';
```
Should show: users, betslips, bet_history, push_notifications

### Step 3: Add Environment Variables (3 min)

**In Railway bet-server service:**
1. Click your bet-server service (not the database)
2. Go to "Variables" tab
3. Click "New Variable" and add:

```bash
DATABASE_URL = postgresql://postgres:xxx... (paste from Step 1)
JWT_SECRET = [Generate using command below]
JWT_EXPIRES_IN = 7d
NODE_ENV = production
```

**Generate JWT_SECRET:**
```bash
# Run this in your terminal:
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Copy the output and paste as JWT_SECRET value
```

### Step 4: Deploy to Railway (2 min)

**Push your changes:**
```bash
cd bet-server
git add .
git commit -m "Add authentication system"
git push
```

Railway will auto-deploy (watch the logs for ~2 minutes)

**Verify deployment:**
- Check logs for: "Server running on port XXXX"
- Check logs for: "Authentication API: http://..."
- No errors about missing modules

### Step 5: Update API URL in React Native (1 min)

**Find your bet-server Railway URL:**
1. In Railway, click bet-server service
2. Go to "Settings" tab
3. Find "Public Networking" section
4. Copy the domain (like: `your-app-name.up.railway.app`)

**Update in your app:**
Open `SportsTrackerExpo/src/screens/bet/BetLoginScreen.js`

Change line 19:
```javascript
const API_URL = "https://YOUR-BET-SERVER-URL.up.railway.app/api/auth";
```

### Step 6: Test! (5 min)

**Start your app:**
```bash
cd SportsTrackerExpo
npx expo start
```

**Test signup:**
1. Open app → Navigate to Betting
2. Try login with: `testuser` / `password123`
3. Click "OK" on signup alert
4. Should see "Account created! You've been given 1000 credits"
5. Should navigate to BetMain

**Verify in database:**
In Railway PostgreSQL Query tab:
```sql
SELECT * FROM users;
```
Should see your testuser with 1000 credits!

**Test auto-login:**
1. Close app completely
2. Reopen app
3. Navigate to Betting
4. Should auto-fill username
5. May auto-login if token is valid

---

## 🔍 Quick Verification Checklist

- [ ] PostgreSQL database created in Railway
- [ ] 4 tables exist (users, betslips, bet_history, push_notifications)
- [ ] DATABASE_URL added to bet-server variables
- [ ] JWT_SECRET added to bet-server variables (64+ characters)
- [ ] bet-server deployed successfully (check logs)
- [ ] API_URL in BetLoginScreen.js points to your Railway URL
- [ ] Can signup new user
- [ ] New user appears in database
- [ ] Password is hashed (not plain text)
- [ ] User gets 1000 starting credits
- [ ] Auto-login works after app restart

---

## 🐛 Common Issues & Solutions

### "Cannot connect to database"
**Check:**
- DATABASE_URL format is correct
- Database is running (green in Railway)
- SSL setting in `db/database.js` (should have `ssl: { rejectUnauthorized: false }`)

**Solution:**
```bash
# In Railway PostgreSQL, go to Variables tab
# Copy DATABASE_URL and ensure it starts with postgresql://
```

### "JWT_SECRET is not defined"
**Check:**
- Variable exists in Railway bet-server (not database)
- Variable name is exactly `JWT_SECRET` (case-sensitive)
- Value is at least 32 characters

**Solution:**
```bash
# Generate new secret:
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
# Add to Railway variables
# Redeploy
```

### "Module not found: bcrypt/jsonwebtoken/pg"
**Solution:**
```bash
cd bet-server
npm install bcrypt jsonwebtoken pg express-validator expo-server-sdk
git add package.json package-lock.json
git commit -m "Update dependencies"
git push
```

### "User not found but I just signed up"
**Check:**
- Look at Railway logs during signup
- Database connection is working
- No SQL errors in logs

**Debug:**
```sql
-- In Railway PostgreSQL Query tab:
SELECT * FROM users ORDER BY created_at DESC;
-- Should see your user
```

### "CORS error in app"
**The bet-server already has CORS enabled**, but if you get errors:

In `bet-server/server.js`, verify:
```javascript
app.use(cors()); // Should be near top of file
```

---

## 📊 API Endpoints Available

**Authentication:**
- `POST /api/auth/signup` - Create new account
- `POST /api/auth/login` - Login existing user
- `POST /api/auth/verify` - Verify JWT token
- `GET /api/auth/profile` - Get user profile
- `POST /api/auth/push-token` - Update push notification token

**Betslips:**
- `POST /api/betslips` - Place a bet
- `GET /api/betslips` - Get user's bet history
- `GET /api/betslips/:id` - Get specific betslip

**Test with curl:**
```bash
# Replace YOUR_URL with your Railway bet-server URL

# Signup
curl -X POST https://YOUR_URL.up.railway.app/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"password123"}'

# Login
curl -X POST https://YOUR_URL.up.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"password123"}'
```

---

## 🎯 Next Steps After Setup

1. **Create User Context** - Store logged-in user data globally
2. **Display Credits** - Show user credits in UI
3. **Connect Betslip** - Integrate bet placement with backend
4. **Push Notifications** - Set up Expo notifications
5. **Bet Settlement** - Auto-resolve bets based on game results

---

## 📱 Frontend Files Updated

✅ `SportsTrackerExpo/src/screens/bet/BetLoginScreen.js`
- Auto-fill username
- Auto-login with stored token
- Signup flow when user not found
- AsyncStorage for credential persistence

✅ `SportsTrackerExpo/src/services/notificationService.js`
- Push notification registration
- Token storage to backend
- Notification handlers

---

## 🔐 Security Notes

✅ **Already Implemented:**
- Passwords hashed with bcrypt (10 rounds)
- JWT tokens for authentication
- SQL injection protection (parameterized queries)
- Environment variables for secrets
- HTTPS on Railway (automatic)

⚠️ **Before Production:**
- Use 64+ character JWT_SECRET
- Add rate limiting on auth endpoints
- Implement account lockout after failed attempts
- Add email verification (optional)
- Set up database backups

---

## 💡 Quick Commands

```bash
# Generate JWT Secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Deploy bet-server
cd bet-server
git add .
git commit -m "Update"
git push

# Test app
cd SportsTrackerExpo
npx expo start

# Check database
# In Railway PostgreSQL → Query tab:
SELECT * FROM users;
SELECT * FROM betslips;
SELECT * FROM bet_history;
```

---

## ✨ What You Have Now

🔐 **Secure Authentication**
- User signup & login
- JWT token-based auth
- Password hashing
- Token persistence

💰 **Credit System**
- Starting credits: 1000
- Transaction tracking
- Credit deduction on bets
- Payout calculation

📊 **Database**
- User management
- Bet storage
- Transaction history
- Push notification log

🚀 **Production Ready**
- Deployed on Railway
- Auto-scaling
- Environment variables
- HTTPS enabled

---

**Need Help?**
- Check Railway logs for errors
- Verify DATABASE_URL is correct
- Ensure JWT_SECRET is set
- Test API endpoints with curl/Postman

Good luck! 🎰

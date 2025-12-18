# 🚀 Quick Start: Supabase Betting Setup

## What Changed?

You're now using **Supabase** instead of Railway + custom Express backend. This is:

- ✅ Simpler
- ✅ More secure (built-in auth)
- ✅ Auto session management
- ✅ No backend code needed

---

## 📋 Setup Checklist

### 1️⃣ Create Supabase Project (5 minutes)

1. Go to [https://supabase.com](https://supabase.com)
2. Sign up / Login
3. Click **"New Project"**
4. Fill in:
   - **Name**: `live-sports-betting`
   - **Database Password**: _(save this!)_
   - **Region**: Choose closest to your users
5. Click **"Create new project"**
6. Wait 2-3 minutes

### 2️⃣ Get API Credentials (1 minute)

1. In your project, click **Settings** (gear icon) → **API**
2. Copy these two values:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public key**: `eyJhbGci...` (long token)
3. Save them somewhere safe

### 3️⃣ Create Database Tables (2 minutes)

**Use SQL Editor (Only Option)**

1. Click **SQL Editor** in sidebar
2. Click **"New query"**
3. Copy the entire contents of `bet-server/supabase-schema.sql`
4. Paste into the editor
5. Click **"Run"**
6. Done! All tables, indexes, policies, and functions created.

**Important**: The schema includes secure functions for credit management:

- `place_bet()` - Automatically deducts credits when placing bets
- `settle_bet()` - Admin-only function to resolve bets and pay winners
- Credits are **read-only** for users (you can only edit from Supabase dashboard)

### 4️⃣ ~~Configure Your App~~ ✅ Already Done!

Your app is already configured with:

- **Project URL**: `https://eperosapdieldfvanrtq.supabase.co`
- **Anon Key**: Already set in `SportsTrackerExpo/src/config/supabase.js`

- **Authentication**: Username + Password (no email required!)
- Users sign up with just username and password
- Internally generates a deterministic fake phone number for Supabase phone auth (e.g. `+1555XXXXXXX`).
- Note: Your Supabase project must have phone/SMS auth enabled. If you haven't configured an SMS provider, you may need to create users manually in the dashboard for testing.
- Credits start at 1000 and are **read-only** (can't be edited by users)

### 5️⃣ Test It! (2 minutes)

1. Run your app:
   ```bash
   cd SportsTrackerExpo
   npm start
   ```
2. Navigate to the betting section
3. Try signing up:

   - Enter username: `testuser`
   - Enter password: `password123`
   - Click **Login**
   - Alert should say "Account not found. Create account?"
   - Click **OK**
   - Should create account and login!

4. Check Supabase:

   - Go to **Authentication** → **Users**
   - You'll see `testuser@users.livetracker.app` (auto-generated email)
   - Go to **Table Editor** → **profiles**
   - You'll see username: `testuser` with 1000 credits!

5. Close app and reopen:

   - Should auto-login (session persisted)

6. Try editing credits:
   - Credits are **read-only** for users
   - Only you can edit from Supabase dashboard
   - To place bets, use the `place_bet()` function (see `betService.js`)

---

## ✅ What's Working Now

- ✅ User signup (username + password, no email!)
- ✅ User login
- ✅ Auto-login on app restart
- ✅ 1000 starting credits for new users
- ✅ **Read-only credits** (users can't edit, only you via Supabase)
- ✅ Secure password hashing (handled by Supabase)
- ✅ Session persistence (handled by Supabase)
- ✅ `place_bet()` function to handle bets with automatic credit deduction
- ✅ `settle_bet()` function for admins to resolve bets

---

## 📁 Files Updated

### Created:

- `SportsTrackerExpo/src/config/supabase.js` - Supabase client config ✅ **Already configured!**
- `SportsTrackerExpo/src/services/betService.js` - Helper functions for betting
- `bet-server/supabase-schema.sql` - Complete database schema with secure functions
- `SUPABASE_SETUP_GUIDE.md` - Detailed setup instructions

### Modified:

- `SportsTrackerExpo/src/screens/bet/BetLoginScreen.js` - Username/password auth

### Packages Installed:

- `@supabase/supabase-js` - Supabase JavaScript client

---

## 🎯 Next Steps (After Basic Setup Works)

1. **Place Bets**: Update bet placement to use Supabase
2. **Show Betslips**: Query `betslips` table
3. **Deduct Credits**: Update profile credits when bet is placed
4. **Push Notifications**: Store Expo push tokens
5. **Bet Settlement**: Add logic to resolve bets and pay out

---

## 🆘 Troubleshooting

### "Invalid login credentials"

- Email/password don't match any user
- Try creating a new account

### "New row violates row-level security policy"

- RLS policies not set up correctly
- Re-run the SQL from `bet-server/supabase-schema.sql`

### "User already registered"

- Email already exists in Supabase
- Use different email or login instead

### Auto-login not working

- Check `supabase.js` has correct URL and key
- Session should persist automatically via AsyncStorage

### Can't see data in Table Editor

- RLS is hiding it from you
- Use **SQL Editor** to query:
  ```sql
  SELECT * FROM profiles;
  ```

---

## 📚 Resources

- **Full Guide**: [SUPABASE_SETUP_GUIDE.md](SUPABASE_SETUP_GUIDE.md)
- **Supabase Docs**: [https://supabase.com/docs](https://supabase.com/docs)
- **Auth Docs**: [https://supabase.com/docs/guides/auth](https://supabase.com/docs/guides/auth)
- **Discord**: [https://discord.supabase.com](https://discord.supabase.com)

---

## 💡 Key Differences from Railway

| Feature           | Railway (Old)         | Supabase (New)       |
| ----------------- | --------------------- | -------------------- |
| Authentication    | Custom JWT            | Built-in             |
| Session           | Manual AsyncStorage   | Automatic            |
| Database          | PostgreSQL (manual)   | PostgreSQL (with UI) |
| Password Security | bcrypt (manual)       | Built-in             |
| Backend Code      | Express server needed | No backend needed    |
| SQL Editor        | ❌ Not available      | ✅ Built-in          |

---

**You're all set! Follow the checklist above and you'll be betting in 10 minutes.** 🎉

# ✅ READY TO TEST - Supabase Betting System

## Current Status: Configured & Ready

Your betting system is **fully configured** with Supabase and ready to test!

---

## ✨ What's Different Now

### Authentication

- ✅ **Username + Password** (no email required!)
- Users sign up with just `username` and `password`
- Internally generates a deterministic fake phone number for Supabase phone auth (e.g. `+1555XXXXXXX`).
- Note: Phone/SMS auth must be enabled in Supabase. If SMS provider isn't set, create test users in the dashboard.
- Session auto-persists (no manual AsyncStorage needed)

### Credits System

- ✅ **Read-only for users**
- Users cannot edit their credits manually
- Only you can edit credits from Supabase dashboard
- `place_bet()` function automatically deducts credits
- `settle_bet()` function adds winnings (admin only)

### Your Supabase Project

- **URL**: `https://eperosapdieldfvanrtq.supabase.co`
- **Status**: ✅ Already configured in your app

---

## 🚀 Next Step: Run the SQL Schema

### This is the ONLY thing you need to do:

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Open your project: `eperosapdieldfvanrtq`
3. Click **SQL Editor** in the sidebar
4. Click **New query**
5. Open `bet-server/supabase-schema.sql` in VS Code
6. Copy **EVERYTHING** (Ctrl+A, Ctrl+C)
7. Paste into Supabase SQL Editor
8. Click **Run** button

**What this does:**

- Creates 4 tables: `profiles`, `betslips`, `bet_history`, `push_tokens`
- Creates 5 indexes for performance
- Sets up Row Level Security (RLS) policies
- Creates `update_updated_at_column()` trigger function
- Creates `place_bet()` function (users call this to place bets)
- Creates `settle_bet()` function (you call this to resolve bets)

**Time**: 30 seconds

---

## 🧪 Testing (After Running SQL)

### Test 1: Signup

```bash
cd SportsTrackerExpo
npm start
```

1. Navigate to betting section
2. Enter username: `testuser`
3. Enter password: `test123`
4. Click **Login**
5. Alert: "Account not found. Create account?"
6. Click **OK**
7. ✅ Should create account and show success!

### Test 2: Check Supabase

1. Go to **Authentication** → **Users**
2. ✅ You'll see: `testuser@users.livetracker.app`

3. Go to **Table Editor** → **profiles**
4. ✅ You'll see:
   - `username`: testuser
   - `credits`: 1000

### Test 3: Auto-Login

1. Close the app completely
2. Reopen the app
3. Navigate to betting section
4. ✅ Should be auto-logged in!

### Test 4: Edit Credits (Admin Only)

1. Go to **Table Editor** → **profiles**
2. Click on the `1000` in the credits column
3. Change it to `2000`
4. Press Enter
5. ✅ Credits updated!

---

## 📚 Documentation Created

1. **[SUPABASE_QUICK_START.md](SUPABASE_QUICK_START.md)**

   - Quick checklist to get started

2. **[SUPABASE_SETUP_GUIDE.md](SUPABASE_SETUP_GUIDE.md)**

   - Detailed 10-step guide with explanations

3. **[BETTING_USAGE_GUIDE.md](BETTING_USAGE_GUIDE.md)**

   - How to place bets (for app users)
   - How to manage bets (for you as admin)
   - SQL queries for common tasks
   - Security documentation

4. **[bet-server/supabase-schema.sql](bet-server/supabase-schema.sql)**

   - Complete database schema
   - Copy/paste this into Supabase SQL Editor

5. **[SportsTrackerExpo/src/services/betService.js](SportsTrackerExpo/src/services/betService.js)**
   - Helper functions for betting
   - Use these in your components

---

## 🎯 Example: How to Place a Bet in Your App

```javascript
import { placeBet, getUserProfile } from "../services/betService";

// Place a bet
const result = await placeBet(
  "nba-lal-vs-gsw-2024", // game_id
  "LAL -5.5", // selection
  100, // amount (credits)
  1.91 // odds
);

if (result.success) {
  Alert.alert("Success", "Bet placed!");

  // Refresh user credits
  const profile = await getUserProfile();
  console.log("Credits left:", profile.profile.credits);
} else {
  Alert.alert("Error", result.error);
}
```

---

## 🔐 Security Features

### Users Can:

✅ Read their own profile (including credits)
✅ Place bets (credits automatically deducted)
✅ View their own betslips
✅ View their own bet history

### Users Cannot:

❌ Edit credits directly
❌ Edit betslip status
❌ View other users' data
❌ Settle bets

### You (Admin) Can:

✅ Edit credits directly in Supabase
✅ Settle bets: `SELECT settle_bet('betslip-id'::uuid, true);`
✅ View all users and data
✅ Run custom SQL queries

---

## 🛠️ Common Admin Tasks

### Give a User Credits

```sql
-- Add 500 credits to testuser
UPDATE profiles
SET credits = credits + 500
WHERE username = 'testuser';
```

### Settle a Bet as WON

```sql
-- Mark bet as won (automatically pays out)
SELECT settle_bet('betslip-uuid-here'::uuid, true);
```

### Settle a Bet as LOST

```sql
-- Mark bet as lost (no payout)
SELECT settle_bet('betslip-uuid-here'::uuid, false);
```

### View All Pending Bets

```sql
SELECT
  b.id,
  p.username,
  b.game_id,
  b.selection,
  b.amount,
  b.odds,
  b.created_at
FROM betslips b
JOIN profiles p ON p.id = b.user_id
WHERE b.status = 'pending'
ORDER BY b.created_at DESC;
```

---

## 📞 Need Help?

### Issue: "Insufficient credits" error

**Solution**: User doesn't have enough credits

```sql
SELECT username, credits FROM profiles WHERE username = 'testuser';
-- Add credits:
UPDATE profiles SET credits = credits + 1000 WHERE username = 'testuser';
```

### Issue: Auto-login not working

**Solution**: Clear app storage and try again

- Settings → Apps → Your App → Clear Storage

### Issue: Can't see data in Table Editor

**Solution**: RLS is hiding it

- Use **SQL Editor** instead:

```sql
SELECT * FROM profiles;
SELECT * FROM betslips;
```

---

## 🎉 You're All Set!

**Next step**: Run the SQL schema in Supabase (see top of this file)

**After that**: Test signup/login in your app

**Then**: Start building your betting UI using `betService.js` functions!

---

## 📝 Files Modified

### ✅ Already Configured:

- `SportsTrackerExpo/src/config/supabase.js` - Your Supabase credentials
- `SportsTrackerExpo/src/screens/bet/BetLoginScreen.js` - Username/password auth

### 📦 New Files:

- `SportsTrackerExpo/src/services/betService.js` - Betting helper functions
- `bet-server/supabase-schema.sql` - Database schema (run this in Supabase!)
- `BETTING_USAGE_GUIDE.md` - Complete usage documentation

### 📦 Packages Installed:

- `@supabase/supabase-js` ✅ Installed

---

**Status**: Ready to run SQL schema and test! 🚀

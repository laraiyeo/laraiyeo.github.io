# Complete Supabase Setup Guide for Betting App

This guide walks through setting up Supabase as your authentication and database backend for the betting feature.

---

## Why Supabase?

✅ Built-in authentication (email/password)  
✅ PostgreSQL database with easy UI  
✅ Automatic session management  
✅ Row-level security  
✅ No custom backend needed  
✅ Perfect for Expo React Native

---

## STEP 1: Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Click **Sign Up** (use GitHub or email)
3. Click **New Project**
4. Fill in:
   - **Name**: `live-sports-betting` (or your choice)
   - **Database Password**: Create a strong password (save it!)
   - **Region**: Choose closest to your users
5. Click **Create new project**
6. Wait 2-3 minutes for setup to complete

---

## STEP 2: Get Your API Credentials

1. In Supabase dashboard, click **Settings** (gear icon) → **API**
2. Copy these two values:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public key**: `eyJhbGci...` (long token)
3. **Save these** — you'll need them in Step 5

---

## STEP 3: Enable Email Authentication

1. Go to **Authentication** → **Providers**
2. Find **Email** provider
3. Make sure it's **enabled** (should be by default)
4. **Optional**: Disable email confirmation for testing
   - Go to **Authentication** → **Settings**
   - Turn OFF "Enable email confirmations"
   - This lets you test signup without clicking email links

---

## STEP 4: Create Database Tables

### A. Create `profiles` table

1. Go to **Table Editor** (database icon on left)
2. Click **New Table**
3. Fill in:
   - **Name**: `profiles`
   - **Enable Row Level Security (RLS)**: ✅ Check this
4. Add columns (click "+ Add column"):

| Column Name | Type        | Default Value | Primary | Required | Unique |
| ----------- | ----------- | ------------- | ------- | -------- | ------ |
| id          | uuid        |               | ✅      | ✅       | ✅     |
| username    | text        |               |         | ✅       | ✅     |
| credits     | int8        | 1000          |         | ✅       |        |
| created_at  | timestamptz | now()         |         | ✅       |        |
| updated_at  | timestamptz | now()         |         | ✅       |        |

5. **Important**: For the `id` column:
   - Click **Edit** on the `id` column
   - Set **Foreign Key Relation**:
     - Table: `auth.users`
     - Column: `id`
     - On Delete: `CASCADE`
6. Click **Save**

### B. Create `betslips` table

1. Click **New Table**
2. Fill in:
   - **Name**: `betslips`
   - **Enable RLS**: ✅
3. Add columns:

| Column Name | Type        | Default Value     | Primary | Required |
| ----------- | ----------- | ----------------- | ------- | -------- |
| id          | uuid        | gen_random_uuid() | ✅      | ✅       |
| user_id     | uuid        |                   |         | ✅       |
| game_id     | text        |                   |         | ✅       |
| selection   | text        |                   |         | ✅       |
| amount      | numeric     |                   |         | ✅       |
| odds        | float8      |                   |         | ✅       |
| status      | text        | 'pending'         |         | ✅       |
| created_at  | timestamptz | now()             |         | ✅       |
| updated_at  | timestamptz | now()             |         | ✅       |

4. **Set Foreign Key** for `user_id`:
   - Table: `auth.users`
   - Column: `id`
   - On Delete: `CASCADE`
5. Click **Save**

### C. Create `bet_history` table

1. Click **New Table**
2. Fill in:
   - **Name**: `bet_history`
   - **Enable RLS**: ✅
3. Add columns:

| Column Name   | Type        | Default Value     | Primary | Required |
| ------------- | ----------- | ----------------- | ------- | -------- |
| id            | uuid        | gen_random_uuid() | ✅      | ✅       |
| user_id       | uuid        |                   |         | ✅       |
| betslip_id    | uuid        |                   |         |          |
| change_amount | numeric     |                   |         | ✅       |
| reason        | text        |                   |         |          |
| created_at    | timestamptz | now()             |         | ✅       |

4. **Set Foreign Keys**:
   - `user_id` → `auth.users(id)` CASCADE
   - `betslip_id` → `betslips(id)` CASCADE
5. Click **Save**

### D. Create `push_tokens` table

1. Click **New Table**
2. Fill in:
   - **Name**: `push_tokens`
   - **Enable RLS**: ✅
3. Add columns:

| Column Name     | Type        | Default Value     | Primary | Required | Unique |
| --------------- | ----------- | ----------------- | ------- | -------- | ------ |
| id              | uuid        | gen_random_uuid() | ✅      | ✅       |        |
| user_id         | uuid        |                   |         | ✅       | ✅     |
| expo_push_token | text        |                   |         | ✅       |        |
| platform        | text        |                   |         |          |        |
| created_at      | timestamptz | now()             |         | ✅       |        |

4. **Set Foreign Key** for `user_id`:
   - Table: `auth.users`
   - Column: `id`
   - On Delete: `CASCADE`
5. Click **Save**

---

## STEP 5: Set Row Level Security Policies

### A. `profiles` policies

1. Go to **Authentication** → **Policies**
2. Select table: `profiles`
3. Click **New Policy**

**Policy 1: Users can read own profile**

```sql
CREATE POLICY "Users can read own profile"
ON profiles
FOR SELECT
USING (auth.uid() = id);
```

**Policy 2: Users can update own profile**

```sql
CREATE POLICY "Users can update own profile"
ON profiles
FOR UPDATE
USING (auth.uid() = id);
```

**Policy 3: Users can insert own profile**

```sql
CREATE POLICY "Users can insert own profile"
ON profiles
FOR INSERT
WITH CHECK (auth.uid() = id);
```

### B. `betslips` policies

```sql
CREATE POLICY "Users manage own betslips"
ON betslips
FOR ALL
USING (auth.uid() = user_id);
```

### C. `bet_history` policies

```sql
CREATE POLICY "Users can read own bet history"
ON bet_history
FOR SELECT
USING (auth.uid() = user_id);
```

### D. `push_tokens` policies

```sql
CREATE POLICY "Users manage own push tokens"
ON push_tokens
FOR ALL
USING (auth.uid() = user_id);
```

---

## STEP 6: Create Database Function for Auto-Update

Go to **SQL Editor** and run:

```sql
-- Function to auto-update updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for profiles table
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON profiles
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Trigger for betslips table
CREATE TRIGGER update_betslips_updated_at
BEFORE UPDATE ON betslips
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
```

---

## STEP 7: Install Supabase in Your Expo App

Open terminal in `SportsTrackerExpo` folder:

```bash
npm install @supabase/supabase-js
```

---

## STEP 8: Create Supabase Config File

The code has been updated — see `SportsTrackerExpo/src/config/supabase.js`

**Update the file with your credentials from Step 2:**

- Replace `YOUR_SUPABASE_URL` with your Project URL
- Replace `YOUR_SUPABASE_ANON_KEY` with your anon public key

---

## STEP 9: Test Authentication

1. Run your Expo app:

   ```bash
   cd SportsTrackerExpo
   npm start
   ```

2. Navigate to the betting section
3. Try to **Sign Up**:

   - Enter email and password
   - Should create account and auto-login
   - Check Supabase → Authentication → Users (you'll see the new user)
   - Check Supabase → Table Editor → profiles (you'll see profile with 1000 credits)

4. Close app and reopen:

   - Should auto-login (session persisted)

5. Try **Login** with wrong credentials:
   - Should show "Account not found" alert with signup option

---

## STEP 10: Verify Database

In Supabase dashboard:

1. Go to **Table Editor** → **profiles**
2. You should see your user with 1000 credits

3. Go to **Authentication** → **Users**
4. You should see your email

---

## What About `bet-server` Folder?

With Supabase, you **don't need** a custom Express backend for auth or basic database operations. However, you might still use `bet-server` for:

- **Sending push notifications** (Expo Server SDK)
- **Bet settlement logic** (calculate winners, update credits)
- **Admin operations** (manage users, credits)
- **Scheduled tasks** (auto-resolve bets)

For now, you can ignore `bet-server` and come back to it later if you need these advanced features. Supabase Edge Functions can also handle many of these.

---

## Next Steps

✅ Supabase project created  
✅ Tables and policies set up  
✅ Expo app configured  
✅ Authentication working

**Now you can:**

- Implement bet placement logic
- Add credit deduction on bet placement
- Display user's betslips
- Implement bet settlement
- Add push notifications

---

## Troubleshooting

### "User already registered" error

- Email is already in auth.users
- Use different email or login instead

### "New row violates row-level security policy"

- Check RLS policies are created correctly
- Make sure `auth.uid()` matches user_id

### Auto-login not working

- Supabase sessions persist automatically in AsyncStorage
- Call `supabase.auth.getSession()` on app load

### Can't see data in Table Editor

- RLS is blocking you
- Click **Settings** → **Policies** → temporarily disable RLS for testing
- Or use **SQL Editor** to query directly

---

## Support

- Supabase Docs: [https://supabase.com/docs](https://supabase.com/docs)
- Discord: [https://discord.supabase.com](https://discord.supabase.com)

---

**Your betting app is now backed by Supabase!** 🎉

# How to Use Betting Features

## For App Users (Players)

### Place a Bet

```javascript
import { placeBet, getUserProfile } from "../services/betService";

// Example: Place a bet on a game
const handlePlaceBet = async () => {
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
    console.log("Remaining credits:", profile.profile.credits);
  } else {
    Alert.alert("Error", result.error);
  }
};
```

### Check Current Credits

```javascript
import { getUserProfile } from "../services/betService";

const checkCredits = async () => {
  const result = await getUserProfile();

  if (result.success) {
    console.log("Username:", result.profile.username);
    console.log("Credits:", result.profile.credits);
  }
};
```

### View My Betslips

```javascript
import { getUserBetslips } from "../services/betService";

// Get all betslips
const allBets = await getUserBetslips();

// Get only pending bets
const pendingBets = await getUserBetslips("pending");

// Get only won bets
const wonBets = await getUserBetslips("won");

// Get only lost bets
const lostBets = await getUserBetslips("lost");

console.log(allBets.betslips);
```

### View Bet History

```javascript
import { getBetHistory } from "../services/betService";

const history = await getBetHistory();

if (history.success) {
  history.history.forEach((entry) => {
    console.log(`${entry.reason}: ${entry.change_amount} credits`);
  });
}
```

---

## For Admin (You - from Supabase Dashboard)

### 1. View All Users and Credits

1. Go to **Table Editor** → **profiles**
2. See all users with their credits
3. You can edit credits directly by clicking on a cell

### 2. Manually Add/Remove Credits

1. Go to **Table Editor** → **profiles**
2. Find the user
3. Click on their `credits` value
4. Edit the number
5. Press Enter

### 3. Settle a Bet (Mark as Won/Lost)

**Option A: Using SQL Editor**

```sql
-- Mark bet as WON (pays out credits)
SELECT settle_bet(
  'betslip-uuid-here'::uuid,
  true  -- true = won, false = lost
);

-- Mark bet as LOST (no payout)
SELECT settle_bet(
  'betslip-uuid-here'::uuid,
  false
);
```

**Option B: Manual Method**

1. Go to **Table Editor** → **betslips**
2. Find the bet you want to settle
3. Click on the `status` field
4. Change from `pending` to `won` or `lost`
5. If won, also:
   - Go to **profiles**
   - Find the user
   - Add `(amount * odds)` to their credits

**Note**: Option A is recommended because it automatically:

- Calculates the payout
- Updates the betslip status
- Adds credits to the user's account
- Records the transaction in bet_history

### 4. View All Pending Bets

**SQL Editor:**

```sql
SELECT
  b.id,
  b.game_id,
  b.selection,
  b.amount,
  b.odds,
  p.username,
  b.created_at
FROM betslips b
JOIN profiles p ON p.id = b.user_id
WHERE b.status = 'pending'
ORDER BY b.created_at DESC;
```

**Table Editor:**

1. Go to **betslips**
2. Click **Filter**
3. Add filter: `status` = `pending`

### 5. See User's Betting Activity

```sql
SELECT
  p.username,
  COUNT(b.id) as total_bets,
  SUM(CASE WHEN b.status = 'won' THEN 1 ELSE 0 END) as wins,
  SUM(CASE WHEN b.status = 'lost' THEN 1 ELSE 0 END) as losses,
  SUM(CASE WHEN b.status = 'pending' THEN 1 ELSE 0 END) as pending,
  p.credits as current_credits
FROM profiles p
LEFT JOIN betslips b ON b.user_id = p.id
GROUP BY p.id, p.username, p.credits
ORDER BY total_bets DESC;
```

### 6. Bulk Settle Bets for a Game

```sql
-- Mark all bets for a specific game and selection as WON
DO $$
DECLARE
  bet_record RECORD;
BEGIN
  FOR bet_record IN
    SELECT id FROM betslips
    WHERE game_id = 'nba-lal-vs-gsw-2024'
    AND selection = 'LAL -5.5'
    AND status = 'pending'
  LOOP
    PERFORM settle_bet(bet_record.id, true);
  END LOOP;
END $$;

-- Mark all other bets for that game as LOST
DO $$
DECLARE
  bet_record RECORD;
BEGIN
  FOR bet_record IN
    SELECT id FROM betslips
    WHERE game_id = 'nba-lal-vs-gsw-2024'
    AND status = 'pending'
  LOOP
    PERFORM settle_bet(bet_record.id, false);
  END LOOP;
END $$;
```

### 7. Add Bonus Credits to All Users

```sql
-- Give everyone 100 bonus credits
UPDATE profiles
SET credits = credits + 100;

-- Record the bonus in bet_history
INSERT INTO bet_history (user_id, change_amount, reason)
SELECT id, 100, 'Holiday bonus'
FROM profiles;
```

### 8. Reset a User's Credits

```sql
-- Reset specific user to 1000 credits
UPDATE profiles
SET credits = 1000
WHERE username = 'testuser';

-- Record the reset
INSERT INTO bet_history (user_id, change_amount, reason)
SELECT id, 1000, 'Account reset'
FROM profiles
WHERE username = 'testuser';
```

---

## Security Notes

### What Users CAN Do:

✅ Read their own profile (including credits)  
✅ Place bets (via `place_bet()` function)  
✅ View their own betslips  
✅ View their own bet history  
✅ Save push notification tokens

### What Users CANNOT Do:

❌ Directly edit credits  
❌ Edit betslip status  
❌ View other users' data  
❌ Delete bet history  
❌ Settle bets

### What Only You (Admin) Can Do:

✅ Edit credits directly in Supabase  
✅ Settle bets (mark won/lost)  
✅ View all users and their data  
✅ Run custom SQL queries  
✅ Bulk operations

---

## Common Admin Tasks

### Daily Settlement Workflow

1. **Morning: Check pending bets**

   ```sql
   SELECT * FROM betslips WHERE status = 'pending';
   ```

2. **After games finish: Settle bets**

   - Use `settle_bet()` function for each bet
   - Or bulk settle by game_id

3. **End of day: Check stats**
   ```sql
   SELECT
     COUNT(*) as total_settled_today,
     SUM(CASE WHEN status = 'won' THEN amount * odds ELSE 0 END) as total_payout
   FROM betslips
   WHERE DATE(updated_at) = CURRENT_DATE
   AND status IN ('won', 'lost');
   ```

### Weekly Maintenance

```sql
-- Check total credits in circulation
SELECT SUM(credits) as total_credits FROM profiles;

-- Check most active users
SELECT
  p.username,
  COUNT(b.id) as bet_count,
  SUM(b.amount) as total_wagered,
  p.credits
FROM profiles p
LEFT JOIN betslips b ON b.user_id = p.id
WHERE b.created_at > NOW() - INTERVAL '7 days'
GROUP BY p.id, p.username, p.credits
ORDER BY bet_count DESC
LIMIT 10;
```

---

## Troubleshooting

### "Insufficient credits" error

- User doesn't have enough credits to place bet
- Check their current credits: `SELECT credits FROM profiles WHERE username = 'user';`
- Add credits if needed: `UPDATE profiles SET credits = credits + 100 WHERE username = 'user';`

### "Not authenticated" error

- User session expired
- Have them logout and login again

### Bet won't settle

- Check if bet status is already 'won' or 'lost'
- Use: `SELECT * FROM betslips WHERE id = 'uuid';`

---

## API Reference

See [betService.js](../SportsTrackerExpo/src/services/betService.js) for complete function documentation.

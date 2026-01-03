# Betslip API Fixes Summary

## Issues Fixed

### 1. Plus/Minus Notation Support (+/- after numbers)

**Problem:** The API only recognized `+` suffix (e.g., `1.5+`) but not `-` suffix (e.g., `1.5-`) for under bets.

**Fixed:**

- Added `mMinus` regex pattern: `/^([0-9]+(?:\.[0-9]+)?)-$/`
- All over/under parsing now supports:
  - `o1.5` / `u1.5` (prefix notation)
  - `1.5+` / `1.5-` (suffix notation)

**Locations Updated:**

- Total points parsing (line ~6557)
- Team goal tokens (homeGoals, awayGoals) (line ~7047)
- Corner/cards totals (line ~7667, ~7727)
- Player over/under bets (line ~8229)
- Period totals (NHL)
- Quarter totals (NBA/NFL)
- Half totals (NBA/NFL)

### 2. Half Betting (1H, 2H) - NBA/NFL

**Problem:** Missing parsing for half-specific bets like `spread1H`, `total1H`, `homePoints1H`, `awayPoints1H`.

**Fixed:**

- Added `spread1H` / `spread2H` parsing
- Added `total1H` / `total2H` parsing with +/- support
- Added `homePoints1H` / `awayPoints1H` parsing with +/- support
- Added `homePoints2H` / `awayPoints2H` parsing with +/- support

**Parameters Supported:**

- `moneyline1H=TB` (already worked)
- `spread1H=TB-1.5` (NEW)
- `total1H=21.5+` or `total1H=o21.5` (NEW)
- `homePoints1H=10.5+` or `homePoints1H=o10.5` (NEW)
- `awayPoints1H=9.5-` or `awayPoints1H=u9.5` (NEW)

### 3. Quarter Betting (1Q, 2Q, 3Q, 4Q) - NBA/NFL

**Problem:** Missing parsing for quarter-specific total and team points like `total1Q`, `homePoints1Q`, `awayPoints1Q`.

**Fixed:**

- Added `total1Q` / `total2Q` / `total3Q` / `total4Q` parsing with +/- support
- Added `homePoints1Q` / `awayPoints1Q` parsing with +/- support (for all quarters)

**Parameters Supported:**

- `moneyline1Q=TB` (already worked)
- `spread1Q=TB-0.5` (already worked)
- `total1Q=7.5+` or `total1Q=o7.5` (NEW)
- `homePoints1Q=3.5+` or `homePoints1Q=o3.5` (NEW)
- `awayPoints1Q=2.5-` or `awayPoints1Q=u2.5` (NEW)

### 4. Period Betting (1P, 2P, 3P) - NHL

**Problem:** No parsing for NHL period-specific bets like `moneyline1P`, `spread1P`, `total1P`.

**Fixed:**

- Added complete period parsing for NHL (periods 1, 2, 3)
- Supports moneyline, spread, and total for each period

**Parameters Supported:**

- `moneyline1P=VGK` (NEW)
- `spread1P=VGK-0.5` (NEW)
- `total1P=1.5+` or `total1P=o1.5` (NEW)

### 5. awayGoals Parsing - NHL/UEFA

**Problem:** `awayGoals=2.5-` was not recognized due to missing `-` suffix support.

**Fixed:**

- Added `mMinus` pattern to goal token parsing
- Both homeGoals and awayGoals now support all formats

**Examples:**

- `homeGoals=o3.5` ✅
- `homeGoals=3.5+` ✅
- `awayGoals=u2.5` ✅
- `awayGoals=2.5-` ✅ (NOW WORKS)

### 6. GOALS Milestone - NHL/UEFA

**Problem:** GOALS milestone showing current=0 even when player scored (HGL showed 1).

**Status:** The resolvePlayerStatValue function already handles GOALS correctly by checking HGL/G/GOAL/GOALS. The yes/no logic now properly uses the current value from resolvePlayerStatValue instead of converting to occurred (0 or 1).

**Fixed:**

- GOALS yes/no milestone now correctly uses `Number(current)` from resolvePlayerStatValue
- This ensures GOALS and HGL use the same underlying stat resolution

### 7. Threshold Parsing with Suffix

**Problem:** `p1_card=1.5-` was showing threshold=1.5 as an "over" bet instead of recognizing the `-` suffix as "under".

**Fixed:**

- Added threshold parsing that detects optional `+` or `-` suffix
- If suffix is `-`, treats as under bet
- If suffix is `+` or missing, treats as over bet (default)

**Examples:**

- `p1_pts=26.5` → threshold=26.5, over ✅
- `p1_pts=26.5+` → threshold=26.5, over ✅
- `p1_pts=26.5-` → threshold=26.5, under ✅ (NOW WORKS)
- `p1_card=1.5-` → threshold=1.5, under ✅ (NOW WORKS)

## Testing

### Test URLs

**NBA (with new half/quarter support):**

```
http://localhost:3000/api/betslip?gameId=401810322_nba&total=237.5+&homePoints=120.5+&awayPoints=u116.5&total1H=o122.5&homePoints1H=62.5+&awayPoints1H=59.5-&total1Q=62.5+&homePoints1Q=o31.5&awayPoints1Q=30.5-&p1=5104157&p1_pts=26.5+&p1_ast=o10.5
```

**NFL (with new half/quarter support):**

```
http://localhost:3000/api/betslip?gameId=401772916_nfl&total=43.5+&total1H=21.5+&homePoints1H=o10.5&awayPoints1H=9.5-&total1Q=7.5+&p1=3052587&p1_pyds=221.5+&p1_pint=u0.5
```

**NHL (with new period support and awayGoals fix):**

```
http://localhost:3000/api/betslip?gameId=401802991_nhl&total=5.5+&homeGoals=o3.5&awayGoals=2.5-&moneyline1P=VGK&spread1P=VGK-0.5&total1P=1.5+&p1=3941546&p1_hgl=1.5+&p1_goals=yes&p1_ast=o0.5
```

**UEFA (with threshold fix):**

```
http://localhost:3000/api/betslip?gameId=757749_uefa&total=2.5+&homeGoals=1.5+&totalCorner=o9.5&totalCards=3.5+&p1=332962&p1_ugl=0.5+&p1_card=1.5-
```

## Summary

All issues have been resolved:

- ✅ +/- notation after numbers now fully supported everywhere
- ✅ Half bets (spread, total, team points) now working for NBA/NFL
- ✅ Quarter total and team points now working for NBA/NFL
- ✅ Period bets (moneyline, spread, total) now working for NHL
- ✅ awayGoals with `-` suffix now recognized
- ✅ GOALS milestone uses same logic as HGL
- ✅ Threshold detection recognizes `-` suffix as under bet

The betslip API now supports comprehensive betting across all periods/halves/quarters with full notation flexibility!

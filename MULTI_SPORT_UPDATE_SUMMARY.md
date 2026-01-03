# Multi-Sport Bet App Update Summary

## Overview
Updated the React Native bet app to support multiple sports (NBA, NFL, NHL, UEFA) with proper URL routing and sport-specific data management.

## Changes Made

### 1. BetTabNavigator.js
**Purpose**: Parent navigator with sport selector tabs

**Changes**:
- Created `SportContext` with `useSport()` hook for sharing sport state
- Added all 4 sports to the selector: NBA, NFL, NHL, UEFA
- Added `hideSportTabs` state for conditional rendering
- Sport tabs now hide on Leaders, Bets, and Settings screens
- Wrapped component in `SportContext.Provider`

**Key Code**:
```javascript
const SportContext = createContext();
export const useSport = () => useContext(SportContext);

const sports = [
  { name: "NBA", icon: "basketball" },
  { name: "NFL", icon: "american-football" },
  { name: "NHL", icon: "hockey-puck" },
  { name: "UEFA", icon: "football" }
];
```

### 2. NBABetTabNavigator.js
**Purpose**: Bottom tab navigator for NBA screens

**Changes**:
- Imported `useSport` hook from BetTabNavigator
- Changed from `const sport = "NBA"` to `const { sport } = useSport()`
- Added `onHideSportTabs` prop
- Added `screenListeners` to detect screen changes and hide sport tabs on:
  - BetLeaders
  - BetBets
  - BetSettings

**Key Code**:
```javascript
const { sport } = useSport();

screenListeners={{
  state: (e) => {
    const currentRoute = e.data?.state?.routes?.[e.data?.state?.index]?.name;
    const shouldHide = ['BetLeaders', 'BetBets', 'BetSettings'].includes(currentRoute);
    onHideSportTabs?.(shouldHide);
  },
}}
```

### 3. NFLBetTabNavigator.js
**Purpose**: Bottom tab navigator for NFL screens

**Changes**: Same pattern as NBABetTabNavigator
- Uses `useSport()` hook
- Accepts `onHideSportTabs` prop
- Added `screenListeners` for conditional tab hiding

### 4. SOCCERBetTabNavigator.js
**Purpose**: Bottom tab navigator for UEFA/NHL screens

**Changes**: Same pattern as NBABetTabNavigator
- Uses `useSport()` hook
- Accepts `onHideSportTabs` prop
- Added `screenListeners` for conditional tab hiding

### 5. BetDataContext.js
**Purpose**: Provides scoreboard/roster data with intelligent polling

**Major Changes**:
1. **Multi-Sport State Management**:
   - Changed from single data objects to sport-keyed objects
   - `scoreboardData` is now `{ NBA: {...}, NFL: {...}, NHL: {...}, UEFA: {...} }`
   - `rostersData`, `lastFetchTime`, `currentPollingMode` similarly updated

2. **Sport-Specific URLs**:
   - Old: `/api/scoreboard`
   - New: `/api/scoreboard/${sport.toLowerCase()}`
   - Old: `/api/rosters`
   - New: `/api/rosters/${sport.toLowerCase()}`

3. **Sport-Specific Polling**:
   - Each sport has independent polling intervals
   - Fast (2s) during live games
   - Moderate (90s) before games
   - Slow (30min) otherwise
   - All sports poll simultaneously based on their game states

4. **Sport-Specific Caching**:
   - Cache keys now include sport: `bet_scoreboard_data_${sport}`
   - Each sport cached independently

**Updated Functions**:
```javascript
fetchScoreboard(sport = "NBA")  // Now accepts sport parameter
fetchRosters(sport = "NBA")     // Now accepts sport parameter
fetchInitialData(sport = "NBA") // Now accepts sport parameter
startPolling(mode, sport)       // Updated to handle per-sport intervals
```

**New Context Values**:
```javascript
{
  scoreboardData,      // Object with sport keys
  rostersData,         // Object with sport keys
  currentSport,        // Current active sport
  setCurrentSport,     // Function to change active sport
  lastFetchTime,       // Object with sport keys
  currentPollingMode,  // Object with sport keys
  fetchScoreboard,     // Now accepts sport param
  fetchRosters,        // Now accepts sport param
  fetchInitialData     // Now accepts sport param
}
```

## How It Works

### Sport Selection Flow
1. User selects sport tab in BetTabNavigator (NBA, NFL, NHL, or UEFA)
2. SportContext updates with selected sport
3. Appropriate sport navigator renders (NBA/NFL/SOCCERBetTabNavigator)
4. Sport navigator uses `useSport()` to get current sport
5. Screens receive sport prop and use it for data fetching

### Data Fetching Flow
1. BetDataContext loads cached data for all sports on mount
2. Each sport starts polling based on its game states
3. When screen needs data, it calls:
   - `fetchScoreboard(sport)` with current sport
   - `fetchRosters(sport)` with current sport
4. Data stored in sport-specific keys: `scoreboardData[sport]`
5. Polling adjusts per-sport based on game states

### Tab Hiding Flow
1. User navigates to Leaders, Bets, or Settings screen
2. `screenListeners` in sport navigator detects route change
3. Calls `onHideSportTabs(true)` to hide sport tabs
4. BetTabNavigator conditionally renders sport selector
5. Sport tabs reappear when navigating back to Home or Top

## Server-Side Endpoint Changes

The server already supports sport-specific endpoints:

### Scoreboard Endpoints
- `/api/scoreboard/nba` - NBA games
- `/api/scoreboard/nfl` - NFL games
- `/api/scoreboard/nhl` - NHL games
- `/api/scoreboard/uefa` - UEFA games

### Rosters Endpoints
- `/api/rosters/nba` - NBA rosters
- `/api/rosters/nfl` - NFL rosters
- `/api/rosters/nhl` - NHL rosters
- `/api/rosters/uefa` - UEFA rosters

### Other Sport-Specific Endpoints
All these accept sport parameter:
- `/api/summary/:sport/:eventId`
- `/api/odds/:sport`
- `/api/generate-betslip` (with `sport` query param)

## Testing Checklist

- [ ] Switch between NBA/NFL/NHL/UEFA tabs
- [ ] Verify correct data loads for each sport
- [ ] Check sport tabs hide on Leaders screen
- [ ] Check sport tabs hide on Bets screen
- [ ] Check sport tabs hide on Settings screen
- [ ] Verify sport tabs show on Home screen
- [ ] Verify sport tabs show on Top screen
- [ ] Test polling works independently per sport
- [ ] Verify cached data loads correctly per sport
- [ ] Check AsyncStorage quota handling
- [ ] Test navigation between sports and screens
- [ ] Verify live game detection per sport

## Benefits

1. **Independent Polling**: Each sport polls based on its own game states
2. **Better Performance**: Only fetch data for sports being viewed
3. **Proper Caching**: Sport-specific cache prevents data mixing
4. **Clean UI**: Sport selector hides when not needed
5. **Scalable**: Easy to add more sports in the future
6. **Type Safety**: Sport context provides single source of truth
7. **Server Ready**: Server already supports all sport-specific endpoints

## Future Enhancements

1. Add pull-to-refresh per sport
2. Preload next sport's data when user switches
3. Add sport-specific settings/preferences
4. Show live game indicators on sport tabs
5. Cache roster data per sport (with size limits)

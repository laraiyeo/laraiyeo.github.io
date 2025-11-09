# Sports Tracker Chat Enhancement Setup Guide

## 🎯 What We've Implemented

1. **Preset Emotes System**

   - Uses streamed.pk API for popular emotes
   - Custom sports emotes (🏈⚽🏀🏒)
   - Emote picker in chat input
   - Emote rendering in chat bubbles

2. **Chat Moderation**

   - User blocking (client-side)
   - Message reporting system
   - Profanity filtering
   - Rate limiting (5-second cooldown)
   - Long-press message actions

3. **Game Presence Tracking**
   - Real-time viewer counts per game
   - Live badges on games
   - Automatic join/leave tracking
   - Viewer count display components

## 📋 Setup Steps

### Step 1: Firebase Realtime Database Setup

1. Go to Firebase Console > Your Project
2. Navigate to "Realtime Database" in the sidebar
3. Click "Create Database"
4. Choose your region (same as Firestore for consistency)
5. Start in **test mode** for now
6. Copy your database URL (looks like: `https://PROJECT_ID-default-rtdb.firebaseio.com/`)
7. Update the `databaseURL` in `PresenceService.js`:

```javascript
// In src/services/PresenceService.js, line 10
databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
```

### Step 2: Install Dependencies (if needed)

```bash
npm install firebase@^12.3.0
# Firebase package includes Realtime Database
```

### Step 3: Integration Examples

#### Add Viewer Counter to Game Details Screen

```javascript
// Add to any GameDetailsScreen.js
import { ViewerCounter } from "../../components/ViewerCounter";

// In your component
<ViewerCounter gameId={gameId} style={{ marginTop: 10 }} />;
```

#### Add Live Badges to Game Cards

```javascript
// In game card components
import { LiveViewerBadge } from "../../components/ViewerCounter";

<View style={styles.gameCard}>
  <LiveViewerBadge gameId={game.id} />
  {/* Rest of game card content */}
</View>;
```

#### Show Multiple Game Viewers in Scoreboard

```javascript
// In ScoreboardScreen.js
import { GameViewerList } from "../../components/ViewerCounter";

const gameIds = games.map((game) => game.id);
<GameViewerList gameIds={gameIds} />;
```

## 🔧 Configuration Options

### Emote Service Configuration

```javascript
// In src/services/EmoteService.js
static CUSTOM_EMOTES = [
  {
    id: 'touchdown',
    name: ':touchdown:',
    category: 'sports',
    url: '🏈',
    type: 'custom'
  },
  // Add more custom emotes here
];
```

### Moderation Settings

```javascript
// In src/services/ModerationService.js
static CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
static getProfanityWords() {
  return [
    // Add words to filter here
  ];
}
```

### Presence Tracking Settings

```javascript
// In src/services/PresenceService.js
// Heartbeat interval (how often to update "last seen")
const heartbeatInterval = setInterval(() => {
  // Update every 30 seconds
}, 30000);

// Active viewer threshold (2 minutes)
const activeThreshold = 2 * 60 * 1000;
```

## 🎨 UI Components

### ViewerCounter Component Props

```javascript
<ViewerCounter
  gameId="game123" // Required: Game ID to track
  style={{}} // Optional: Custom styles
  showIcon={true} // Optional: Show eye icon
  compact={false} // Optional: Compact view
/>
```

### EmotePicker Component

Automatically included in MessageInput. Emotes are used like:

- `:GIGACHAD:` → 😎 emote
- `:touchdown:` → 🏈
- `:goal:` → ⚽

### MessageActions Component

Triggered by long-pressing any chat message (except your own):

- Block User
- Report Message (spam, harassment, etc.)

## 📊 Data Structure

### Presence Data (Realtime Database)

```
presence/
  games/
    {gameId}/
      viewers/
        {userId}/
          joinedAt: timestamp
          lastSeen: timestamp
          platform: "mobile"
          version: "1.0.0"
```

### Emotes Data (Firestore)

```
emotes/
  {emoteId}/
    id: string
    name: string (e.g., ":GIGACHAD:")
    category: string ("top", "sports", etc.)
    url: string (image URL)
    type: "streamed" | "custom"
    cached_at?: timestamp
```

### Reports Data (Firestore)

```
reports/
  {reportId}/
    messageId: string
    gameId: string
    reportedBy: string
    reason: "spam" | "harassment" | etc.
    status: "pending" | "resolved"
    createdAt: timestamp
```

## 🚀 Testing

1. **Emotes**: Open chat, tap smiley icon, select emote
2. **Moderation**: Long-press any message from another user
3. **Presence**: Open GameDetailsScreen, check viewer counter updates
4. **Multiple Presence**: Check scoreboard for live game indicators

## 🔒 Security Considerations

1. **Firestore Rules** (add to your existing rules):

```javascript
// Allow emote reads
match /emotes/{emoteId} {
  allow read: if true;
  allow write: if false; // Only server can write emotes
}

// Allow report creation
match /reports/{reportId} {
  allow create: if request.auth != null;
  allow read, update: if false; // Only admins
}
```

2. **Realtime Database Rules**:

```json
{
  "rules": {
    "presence": {
      "games": {
        "$gameId": {
          "viewers": {
            "$userId": {
              ".write": "$userId == auth.uid",
              ".read": true
            }
          }
        }
      }
    }
  }
}
```

## 🎯 Next Steps

1. **Deploy** and test the features
2. **Monitor** Firebase usage for costs
3. **Add admin panel** for managing reports
4. **Optimize** emote caching strategy
5. **Add analytics** for popular emotes/games

## 🐛 Troubleshooting

### Common Issues:

1. **Realtime Database not working**: Check database URL and rules
2. **Emotes not loading**: Check internet connection and API access
3. **Presence not updating**: Verify Firebase config and user permissions
4. **Chat moderation not working**: Check AsyncStorage permissions

### Debug Tools:

```javascript
// Check presence status
PresenceService.getPresenceStats().then(console.log);

// Check cached emotes
EmoteService.getCachedEmotes().then(console.log);

// Check blocked users
ModerationService.getBlockedUsers().then(console.log);
```

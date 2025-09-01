# MLB Ticker for OBS

An ESPN-style ticker overlay for MLB games that can be used in OBS (Open Broadcaster Software) or other streaming software.

## Features

- **Rotating Game Display**: Shows all MLB games (live, scheduled, finished) with 5-second rotations
- **Live Game Info**: Displays scores, inning, bases, count, and current batter
- **Scheduled Games**: Shows start time and team records
- **Finished Games**: Shows final scores with random impressive stats
- **Smooth Animations**: Slide transitions between games
- **OBS Ready**: Fixed 1920x200 resolution perfect for overlay use
- **Real-time Updates**: Automatically refreshes game data every 30 seconds

## How to Use

1. **Access the Ticker**:
   - Go to the MLB "All Games Today" page
   - Click the "📺 Ticker" button next to the page title
   - A new window will open with the ticker

2. **Add to OBS**:
   - In OBS, add a "Browser Source"
   - Set the URL to: `http://localhost:8000/ticker.html` (or your server URL)
   - Set width to 1920, height to 200
   - Position at the bottom of your stream

3. **Customization**:
   - The ticker automatically detects and displays all games for the current day
   - Games are prioritized: Live → Scheduled → Finished
   - Each game shows for exactly 5 seconds before transitioning

## Game Display Formats

### Live Games
- Team names and logos
- Current scores (winner highlighted in gold)
- Inning information (Top/Bot X)
- Outs count
- Base runner positions
- Ball/strike count
- Current batter name

### Scheduled Games
- Team names and logos
- Start time (Eastern Time)
- Team records (wins-losses)

### Finished Games
- Team names and logos
- Final scores (winner highlighted in gold)
- Random impressive stat (e.g., "Walk-Off Win!", "Pitcher's Duel!")

## Technical Details

- **Resolution**: Fixed at 1920x200 pixels
- **Refresh Rate**: Game data updates every 30 seconds
- **Rotation Time**: 5 seconds per game
- **Animation**: 800ms smooth slide transitions
- **Data Source**: MLB Stats API
- **Browser Support**: Modern browsers with ES6+ support

## Files

- `ticker.html` - Main ticker interface
- `ticker.js` - Utility functions and configuration
- `aio.html` - Main games page with ticker button
- `aio.js` - Main games page functionality

## Configuration

You can modify the ticker behavior by editing the `TICKER_CONFIG` object in `ticker.js`:

```javascript
const TICKER_CONFIG = {
  width: 1920,           // Ticker width
  height: 200,           // Ticker height
  slideDuration: 5000,   // Time per game (milliseconds)
  refreshInterval: 30000, // Data refresh interval (milliseconds)
  animationDuration: 800  // Animation duration (milliseconds)
};
```

## Troubleshooting

- **No games showing**: Check if there are MLB games scheduled for today
- **Stuck on loading**: Check browser console for API errors
- **Animation issues**: Ensure browser supports CSS animations
- **OBS not displaying**: Make sure the browser source URL is correct and accessible

## Browser Console Commands

For debugging, you can use these commands in the browser console:

- `clearInterval(slideInterval)` - Stop the rotation
- `showNextGame()` - Manually advance to next game
- `fetchGames()` - Manually refresh game data

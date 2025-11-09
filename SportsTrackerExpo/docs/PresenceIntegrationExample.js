// Example integration for GameDetailsScreen.js

// Add these imports at the top of your GameDetailsScreen
import { ViewerCounter, LiveViewerBadge } from "../../components/ViewerCounter";

// In your GameDetailsScreen component, add the ViewerCounter near the header
const GameDetailsScreen = ({ route, navigation }) => {
  // ... existing code ...
  const { gameId } = route.params; // Make sure you have gameId from route params

  return (
    <View style={styles.container}>
      {/* Existing header content */}

      {/* Add viewer counter in the header area */}
      <View style={styles.headerStats}>
        <ViewerCounter
          gameId={gameId}
          style={styles.viewerCounter}
          compact={false}
        />
        {/* Add your existing header stats here */}
      </View>

      {/* Live badge overlay on stream/content */}
      <View style={styles.contentContainer}>
        <LiveViewerBadge gameId={gameId} />
        {/* Your existing content */}
      </View>

      {/* Rest of your component */}
    </View>
  );
};

// Add these styles
const styles = StyleSheet.create({
  // ... existing styles ...

  headerStats: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  viewerCounter: {
    marginRight: 12,
  },
  contentContainer: {
    position: "relative",
    flex: 1,
  },
});

// For ScoreboardScreen or HomeScreen to show multiple game viewers:
import { GameViewerList } from "../../components/ViewerCounter";

// In your scoreboard component
const ScoreboardScreen = () => {
  const [gameIds, setGameIds] = useState([]);

  // Extract gameIds from your games data
  useEffect(() => {
    if (games && games.length > 0) {
      const ids = games.map((game) => game.id);
      setGameIds(ids);
    }
  }, [games]);

  return (
    <ScrollView>
      {/* Your existing game cards */}

      {/* Show viewer counts for active games */}
      <View style={styles.liveGamesSection}>
        <Text style={styles.sectionTitle}>Live Games</Text>
        <GameViewerList gameIds={gameIds} />
      </View>
    </ScrollView>
  );
};

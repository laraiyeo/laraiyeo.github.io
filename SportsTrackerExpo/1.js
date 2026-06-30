const SportTabNavigator = ({ route }) => {
  const { sport } = route.params;
  const { theme, colors } = useTheme();

  // Get sport-specific components
  const getScreenComponents = (sport) => {
    switch (sport.toLowerCase()) {
      // ... existing cases unchanged ...
      case "soccer":
        // Use conditional logic based on USE_TOP5_FOR_SOCCER constant
        if (USE_TOP5_FOR_SOCCER) {
          return {
            ScoreboardScreen: Top5ScoreboardScreen,
            StandingsScreen: Top5LeaguesScreen,
            SearchScreen: Top5SearchScreen,
            CompareScreen: () => (
              <View style={styles.placeholderContainer}>
                <Text
                  allowFontScaling={false}
                  style={[styles.placeholderText, { color: theme.text }]}
                >
                  Coming Soon
                </Text>
              </View>
            ),
            StatsScreen: Top5TeamsScreen,
          };
        } else {
          // Original soccer logic
          return {
            ScoreboardScreen: SoccerHomeScreen,
            StandingsScreen: SoccerHomeScreen,
            SearchScreen: SoccerHomeScreen,
            CompareScreen: SoccerHomeScreen,
            MoreScreen: SoccerMoreScreen,
          };
        }
      // ... rest of existing cases unchanged ...
    }
  };

  const screens = getScreenComponents(sport);

  // Check if we should use Top5 tab configuration
  const useTop5Tabs = sport?.toLowerCase() === "soccer" && USE_TOP5_FOR_SOCCER;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          // Use Top5 tab icons when USE_TOP5_FOR_SOCCER is true for soccer
          if (useTop5Tabs) {
            const icons = {
              Matches: "football-outline",
              Leagues: "trophy",
              Teams: "people",
              Search: "search",
            };
            return (
              <Ionicons
                name={icons[route.name] ?? "ellipse-outline"}
                size={size}
                color={color}
              />
            );
          }

          // Original icon logic for other cases
          let iconName;
          if (route.name === "Scores") {
            iconName = "stats-chart";
          } else if (route.name === "Standings") {
            iconName = "trophy";
          } else if (route.name === "Search") {
            iconName = "search";
          } else if (route.name === "Compare") {
            iconName = "git-compare";
          } else if (route.name === "Stats") {
            iconName = "bar-chart";
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: theme.textTertiary,
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopWidth: 1,
          borderTopColor: theme.border,
        },
      })}
    >
      {useTop5Tabs ? (
        // Use Top5 tab structure
        <>
          <Tab.Screen
            name="Matches"
            component={screens.ScoreboardScreen}
            initialParams={{ sport }}
            options={{ title: "Matches" }}
          />
          <Tab.Screen
            name="Leagues"
            component={screens.StandingsScreen}
            initialParams={{ sport }}
            options={{ title: "Leagues" }}
          />
          <Tab.Screen
            name="Teams"
            component={screens.StatsScreen}
            initialParams={{ sport }}
            options={{ title: "Teams" }}
          />
          <Tab.Screen
            name="Search"
            component={screens.SearchScreen}
            initialParams={{ sport }}
            options={{ title: "Search" }}
          />
        </>
      ) : (
        // Original tab structure
        <>
          <Tab.Screen
            name="Scores"
            component={screens.ScoreboardScreen}
            initialParams={{ sport }}
            options={{
              title: "Scores",
            }}
          />
          <Tab.Screen
            name="Standings"
            component={screens.StandingsScreen}
            initialParams={{ sport }}
            options={{
              title: "Standings",
            }}
          />
          <Tab.Screen
            name="Search"
            component={screens.SearchScreen}
            initialParams={{ sport }}
            options={{
              title: "Search",
            }}
          />
          <Tab.Screen
            name="Compare"
            component={screens.CompareScreen}
            initialParams={{ sport }}
            options={{
              title: "Compare",
            }}
          />
          <Tab.Screen
            name="Stats"
            component={screens.StatsScreen || screens.MoreScreen}
            initialParams={{ sport }}
            options={{
              title:
                sport?.toLowerCase() === "nba" ||
                sport?.toLowerCase() === "nfl" ||
                sport?.toLowerCase() === "wnba" ||
                sport?.toLowerCase() === "nhl" ||
                sport?.toLowerCase() === "mlb" ||
                sport?.toLowerCase() === "soccer"
                  ? "More"
                  : "Stats",
              tabBarIcon: ({ color, size }) => {
                if (
                  sport?.toLowerCase() === "nba" ||
                  sport?.toLowerCase() === "nfl" ||
                  sport?.toLowerCase() === "wnba" ||
                  sport?.toLowerCase() === "nhl" ||
                  sport?.toLowerCase() === "mlb" ||
                  sport?.toLowerCase() === "soccer"
                ) {
                  return <FontAwesome name="navicon" size={size} color={color} />;
                }
                return <Ionicons name="bar-chart" size={size} color={color} />;
              },
            }}
          />
        </>
      )}
    </Tab.Navigator>
  );
};
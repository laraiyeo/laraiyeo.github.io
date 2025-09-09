import React from 'react';
import { NavigationContainer, getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Import our screens
import NFLScoreboardScreen from './src/screens/NFLScoreboardScreen';
import GameDetailsScreen from './src/screens/GameDetailsScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

// Placeholder screens for other sports
const NBAScreen = () => (
  <View style={styles.placeholderContainer}>
    <Text style={styles.placeholderText}>NBA Coming Soon!</Text>
  </View>
);

const MLBScreen = () => (
  <View style={styles.placeholderContainer}>
    <Text style={styles.placeholderText}>MLB Coming Soon!</Text>
  </View>
);

const NHLScreen = () => (
  <View style={styles.placeholderContainer}>
    <Text style={styles.placeholderText}>NHL Coming Soon!</Text>
  </View>
);

// Stack navigator for NFL section
const NFLStack = () => (
  <Stack.Navigator>
    <Stack.Screen 
      name="NFLScoreboard" 
      component={NFLScoreboardScreen}
      options={{ 
        title: 'NFL Scores',
        headerStyle: {
          backgroundColor: '#013369',
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    />
    <Stack.Screen 
      name="GameDetails" 
      component={GameDetailsScreen}
      options={{ 
        title: 'Game Details',
        headerStyle: {
          backgroundColor: '#013369',
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    />
  </Stack.Navigator>
);

// Main tab navigator
const MainTabNavigator = () => (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      tabBarIcon: ({ focused, color, size }) => {
        let iconName;

        if (route.name === 'NFL') {
          iconName = 'american-football';
        } else if (route.name === 'NBA') {
          iconName = 'basketball';
        } else if (route.name === 'MLB') {
          iconName = 'baseball';
        } else if (route.name === 'NHL') {
          iconName = 'disc';
        }

        return <Ionicons name={iconName} size={size} color={color} />;
      },
      tabBarActiveTintColor: '#013369',
      tabBarInactiveTintColor: 'gray',
      headerShown: false,
      tabBarStyle: {
        backgroundColor: 'white',
        borderTopWidth: 1,
        borderTopColor: '#e0e0e0',
      },
    })}
  >
    <Tab.Screen 
      name="NFL" 
      component={NFLStack}
      options={({ route }) => ({
        title: 'NFL',
        tabBarStyle: ((route) => {
          const routeName = getFocusedRouteNameFromRoute(route) ?? '';
          
          if (routeName === 'GameDetails') {
            return { display: 'none' };
          }
          return {
            backgroundColor: 'white',
            borderTopWidth: 1,
            borderTopColor: '#e0e0e0',
          };
        })(route),
      })}
    />
    <Tab.Screen 
      name="NBA" 
      component={NBAScreen}
      options={{ title: 'NBA' }}
    />
    <Tab.Screen 
      name="MLB" 
      component={MLBScreen}
      options={{ title: 'MLB' }}
    />
    <Tab.Screen 
      name="NHL" 
      component={NHLScreen}
      options={{ title: 'NHL' }}
    />
  </Tab.Navigator>
);

export default function App() {
  return (
    <NavigationContainer>
      <MainTabNavigator />
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  placeholderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  placeholderText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
  },
});

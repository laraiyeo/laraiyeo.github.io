import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../context/ThemeContext';

// Import Valorant screens
import VALHomeScreen from './VALHomeScreen';
import VALDiscoverScreen from './VALDiscoverScreen';
import VALLiveScreen from './VALLiveScreen';
import VALResultsScreen from './VALResultsScreen';
import VALUpcomingScreen from './VALUpcomingScreen';

const Tab = createBottomTabNavigator();

const VALTabNavigator = () => {
  const { colors, theme } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'VALHome') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'VALDiscover') {
            iconName = focused ? 'search' : 'search-outline';
          } else if (route.name === 'VALLive') {
            iconName = focused ? 'radio' : 'radio-outline';
          } else if (route.name === 'VALResults') {
            iconName = focused ? 'trophy' : 'trophy-outline';
          } else if (route.name === 'VALUpcoming') {
            iconName = focused ? 'calendar' : 'calendar-outline';
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
      <Tab.Screen 
        name="VALHome" 
        component={VALHomeScreen}
        options={{ 
          title: 'Home',
        }}
      />
      <Tab.Screen 
        name="VALDiscover" 
        component={VALDiscoverScreen}
        options={{ 
          title: 'Discover',
        }}
      />
      <Tab.Screen 
        name="VALLive" 
        component={VALLiveScreen}
        options={{ 
          title: 'Live',
        }}
      />
      <Tab.Screen 
        name="VALResults" 
        component={VALResultsScreen}
        options={{ 
          title: 'Results',
        }}
      />
      <Tab.Screen 
        name="VALUpcoming" 
        component={VALUpcomingScreen}
        options={{ 
          title: 'Upcoming',
        }}
      />
    </Tab.Navigator>
  );
};

export default VALTabNavigator;
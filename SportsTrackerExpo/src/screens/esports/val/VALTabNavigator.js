import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../context/ThemeContext';

// Import Valorant screens
import VALHomeScreen from './VALHomeScreen';
import VALDiscoverScreen from './VALDiscoverScreen';

const Tab = createBottomTabNavigator();

const VALTabNavigator = () => {
  const { colors, theme } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'VALHome') {
            iconName = 'home';
          } else if (route.name === 'VALDiscover') {
            iconName = 'compass';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: theme.textTertiary,
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopColor: theme.border,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
        },
      })}
    >
      <Tab.Screen 
        name="VALHome" 
        component={VALHomeScreen}
        options={{
          tabBarLabel: 'Home',
        }}
      />
      <Tab.Screen 
        name="VALDiscover" 
        component={VALDiscoverScreen}
        options={{
          tabBarLabel: 'Discover',
        }}
      />
    </Tab.Navigator>
  );
};

export default VALTabNavigator;
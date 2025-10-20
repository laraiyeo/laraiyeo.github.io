import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../context/ThemeContext';

// Import LoL screens
import LOLHomeScreen from './LOLHomeScreen';
import LOLDiscoverScreen from './LOLDiscoverScreen';

const Tab = createBottomTabNavigator();

const LOLTabNavigator = ({ navigation, route }) => {
  const { colors, theme } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'LOLHome') {
            iconName = 'home';
          } else if (route.name === 'LOLDiscover') {
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
        name="LOLHome" 
        component={LOLHomeScreen}
        options={{
          tabBarLabel: 'Home',
        }}
      />
      <Tab.Screen 
        name="LOLDiscover" 
        component={LOLDiscoverScreen}
        options={{
          tabBarLabel: 'Discover',
        }}
      />
    </Tab.Navigator>
  );
};

export default LOLTabNavigator;
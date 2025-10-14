import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../context/ThemeContext';

import CS2HomeScreen from './CS2HomeScreen';
import CS2DiscoverScreen from './CS2DiscoverScreen';

const Tab = createBottomTabNavigator();

const CS2TabNavigator = ({ navigation, route }) => {
  const { colors, theme } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'CS2Home') {
            iconName = 'home';
          } else if (route.name === 'CS2Discover') {
            iconName = 'compass';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: theme.textTertiary,
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
        headerShown: false,
      })}
    >
      <Tab.Screen 
        name="CS2Home" 
        component={CS2HomeScreen}
        options={{
          tabBarLabel: 'Home',
        }}
      />
      <Tab.Screen 
        name="CS2Discover" 
        component={CS2DiscoverScreen}
        options={{
          tabBarLabel: 'Discover',
        }}
      />
    </Tab.Navigator>
  );
};

export default CS2TabNavigator;
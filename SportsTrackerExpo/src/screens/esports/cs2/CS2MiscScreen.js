import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../context/ThemeContext';

const CS2MiscScreen = ({ navigation }) => {
  const { colors, theme } = useTheme();
  const [notifications, setNotifications] = useState({
    matchStart: true,
    favoriteTeams: true,
    liveUpdates: false,
    tournaments: true,
  });

  const toggleNotification = (key) => {
    setNotifications(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleNotificationPress = () => {
    Alert.alert(
      'Enable match notifications',
      'Never miss a match',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Enable', onPress: () => console.log('Notifications enabled') }
      ]
    );
  };

  const MenuSection = ({ title, children }) => (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
      <View style={[styles.sectionContent, { backgroundColor: theme.surfaceSecondary }]}>
        {children}
      </View>
    </View>
  );

  const MenuItem = ({ icon, title, subtitle, onPress, rightComponent, showChevron = true }) => (
    <TouchableOpacity 
      style={styles.menuItem} 
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.menuItemLeft}>
        <View style={[styles.menuItemIcon, { backgroundColor: colors.primary + '20' }]}>
          <Ionicons name={icon} size={20} color={colors.primary} />
        </View>
        <View style={styles.menuItemContent}>
          <Text style={[styles.menuItemTitle, { color: theme.text }]}>{title}</Text>
          {subtitle && (
            <Text style={[styles.menuItemSubtitle, { color: theme.textSecondary }]}>
              {subtitle}
            </Text>
          )}
        </View>
      </View>
      <View style={styles.menuItemRight}>
        {rightComponent}
        {showChevron && !rightComponent && (
          <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          Enable match notifications{'\n'}to never miss a match
        </Text>
        <TouchableOpacity 
          style={[styles.notificationButton, { backgroundColor: colors.primary }]}
          onPress={handleNotificationPress}
        >
          <Ionicons name="notifications" size={16} color="white" />
          <Text style={styles.notificationButtonText}>Enable notifications</Text>
        </TouchableOpacity>
      </View>

      {/* Upcoming Matches Quick Access */}
      <MenuSection title="">
        <MenuItem
          icon="calendar"
          title="Upcoming matches"
          subtitle="View all scheduled matches"
          onPress={() => navigation.navigate('CS2Upcoming')}
        />
      </MenuSection>

      {/* Favorites & Personalization */}
      <MenuSection title="Personalization">
        <MenuItem
          icon="heart"
          title="Favorite Teams"
          subtitle="Manage your favorite CS2 teams"
          onPress={() => navigation.navigate('CS2FavoriteTeams')}
        />
        <View style={styles.separator} />
        <MenuItem
          icon="star"
          title="Following"
          subtitle="Teams and tournaments you follow"
          onPress={() => navigation.navigate('CS2Following')}
        />
        <View style={styles.separator} />
        <MenuItem
          icon="bookmark"
          title="Saved Matches"
          subtitle="Matches you've bookmarked"
          onPress={() => navigation.navigate('CS2SavedMatches')}
        />
      </MenuSection>

      {/* Notification Settings */}
      <MenuSection title="Notifications">
        <MenuItem
          icon="notifications"
          title="Match Start"
          subtitle="Get notified when followed matches begin"
          rightComponent={
            <Switch
              value={notifications.matchStart}
              onValueChange={() => toggleNotification('matchStart')}
              trackColor={{ false: theme.border, true: colors.primary + '40' }}
              thumbColor={notifications.matchStart ? colors.primary : theme.textSecondary}
            />
          }
          showChevron={false}
        />
        <View style={styles.separator} />
        <MenuItem
          icon="heart"
          title="Favorite Teams"
          subtitle="Updates from your favorite teams"
          rightComponent={
            <Switch
              value={notifications.favoriteTeams}
              onValueChange={() => toggleNotification('favoriteTeams')}
              trackColor={{ false: theme.border, true: colors.primary + '40' }}
              thumbColor={notifications.favoriteTeams ? colors.primary : theme.textSecondary}
            />
          }
          showChevron={false}
        />
        <View style={styles.separator} />
        <MenuItem
          icon="flash"
          title="Live Updates"
          subtitle="Real-time match updates"
          rightComponent={
            <Switch
              value={notifications.liveUpdates}
              onValueChange={() => toggleNotification('liveUpdates')}
              trackColor={{ false: theme.border, true: colors.primary + '40' }}
              thumbColor={notifications.liveUpdates ? colors.primary : theme.textSecondary}
            />
          }
          showChevron={false}
        />
        <View style={styles.separator} />
        <MenuItem
          icon="trophy"
          title="Tournaments"
          subtitle="New tournament announcements"
          rightComponent={
            <Switch
              value={notifications.tournaments}
              onValueChange={() => toggleNotification('tournaments')}
              trackColor={{ false: theme.border, true: colors.primary + '40' }}
              thumbColor={notifications.tournaments ? colors.primary : theme.textSecondary}
            />
          }
          showChevron={false}
        />
      </MenuSection>

      {/* Content & Data */}
      <MenuSection title="Content">
        <MenuItem
          icon="stats-chart"
          title="Statistics"
          subtitle="Team and player stats"
          onPress={() => navigation.navigate('CS2Statistics')}
        />
        <View style={styles.separator} />
        <MenuItem
          icon="people"
          title="Teams"
          subtitle="Browse all CS2 teams"
          onPress={() => navigation.navigate('CS2Teams')}
        />
        <View style={styles.separator} />
        <MenuItem
          icon="person"
          title="Players"
          subtitle="Player profiles and stats"
          onPress={() => navigation.navigate('CS2Players')}
        />
        <View style={styles.separator} />
        <MenuItem
          icon="trophy"
          title="Tournaments"
          subtitle="All tournaments and competitions"
          onPress={() => navigation.navigate('CS2Tournaments')}
        />
      </MenuSection>

      {/* App Settings */}
      <MenuSection title="Settings">
        <MenuItem
          icon="download"
          title="Offline Mode"
          subtitle="Download matches for offline viewing"
          onPress={() => navigation.navigate('CS2OfflineMode')}
        />
        <View style={styles.separator} />
        <MenuItem
          icon="shield-checkmark"
          title="Privacy"
          subtitle="Manage your privacy settings"
          onPress={() => navigation.navigate('CS2Privacy')}
        />
        <View style={styles.separator} />
        <MenuItem
          icon="help-circle"
          title="Help & Support"
          subtitle="Get help and contact support"
          onPress={() => navigation.navigate('CS2Support')}
        />
        <View style={styles.separator} />
        <MenuItem
          icon="information-circle"
          title="About"
          subtitle="App version and information"
          onPress={() => navigation.navigate('CS2About')}
        />
      </MenuSection>

      {/* External Links */}
      <MenuSection title="Community">
        <MenuItem
          icon="logo-twitter"
          title="Follow us on Twitter"
          subtitle="Latest updates and news"
          onPress={() => console.log('Open Twitter')}
        />
        <View style={styles.separator} />
        <MenuItem
          icon="logo-discord"
          title="Join our Discord"
          subtitle="Chat with other CS2 fans"
          onPress={() => console.log('Open Discord')}
        />
        <View style={styles.separator} />
        <MenuItem
          icon="logo-reddit"
          title="Reddit Community"
          subtitle="Discussions and highlights"
          onPress={() => console.log('Open Reddit')}
        />
      </MenuSection>

      {/* Bottom Spacing */}
      <View style={styles.bottomSpacing} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 28,
    marginBottom: 16,
  },
  notificationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  notificationButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  sectionContent: {
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  menuItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  menuItemContent: {
    flex: 1,
  },
  menuItemTitle: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 2,
  },
  menuItemSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  menuItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginLeft: 68,
  },
  bottomSpacing: {
    height: 32,
  },
});

export default CS2MiscScreen;
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { useMutedUsers } from "../context/MutedUsersContext";

const MutedUsersScreen = ({ navigation }) => {
  const { theme, colors } = useTheme();
  const { getMutedUsersList, unmuteUser, isLoading } = useMutedUsers();
  const [refreshing, setRefreshing] = useState(false);
  const [mutedUsers, setMutedUsers] = useState([]);

  useEffect(() => {
    loadMutedUsers();
  }, []);

  const loadMutedUsers = () => {
    const usersList = getMutedUsersList();
    // Convert to objects with required properties for display
    const formattedUsers = usersList.map((userName) => ({
      userId: userName, // Use userName as userId since we only store userNames
      userName: userName,
      blockedAt: new Date(), // We don't store the mute date, so use current date
    }));
    setMutedUsers(formattedUsers);
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadMutedUsers();
    setTimeout(() => setRefreshing(false), 1000);
  };

  const handleUnmute = (userId, userName) => {
    Alert.alert(
      "Unmute User",
      `Are you sure you want to unmute ${userName}? You will see their messages again.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unmute",
          onPress: () => {
            try {
              unmuteUser(userId);
              loadMutedUsers(); // Refresh the list
              Alert.alert("Success", `${userName} has been unmuted`);
            } catch (error) {
              Alert.alert("Error", "Failed to unmute user");
            }
          },
        },
      ]
    );
  };

  const renderMutedUser = ({ item }) => (
    <View
      style={[
        styles.userItem,
        { backgroundColor: theme.surface, borderBottomColor: theme.border },
      ]}
    >
      <View style={styles.userInfo}>
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <Text style={styles.avatarText}>
            {item.userName?.charAt(0)?.toUpperCase() || "U"}
          </Text>
        </View>
        <View style={styles.userDetails}>
          <Text style={[styles.userName, { color: theme.text }]}>
            {item.userName}
          </Text>
          <Text style={[styles.mutedDate, { color: theme.textSecondary }]}>
            Muted:{" "}
            {(() => {
              const date = new Date(item.blockedAt);
              const datePart = date.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              });
              const timePart = date.toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              });
              return `${datePart} @ ${timePart}`;
            })()}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.unmuteButton, { backgroundColor: theme.success }]}
        onPress={() => handleUnmute(item.userId, item.userName)}
      >
        <Ionicons name="volume-high" size={16} color="#fff" />
        <Text style={styles.unmuteText}>Unmute</Text>
      </TouchableOpacity>
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons
        name="volume-high"
        size={64}
        color={theme.textSecondary}
        style={styles.emptyIcon}
      />
      <Text style={[styles.emptyTitle, { color: theme.text }]}>
        No Muted Users
      </Text>
      <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
        Users you mute in chat will appear here.{"\n"}
        You can unmute them at any time.
      </Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: theme.surface,
            borderBottomColor: theme.border,
            paddingTop: 60,
          },
        ]}
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          Muted Users
        </Text>
        <View style={styles.headerRight} />
      </View>

      {/* Content */}
      <FlatList
        data={mutedUsers}
        keyExtractor={(item) => item.userId}
        renderItem={renderMutedUser}
        ListEmptyComponent={renderEmptyState}
        contentContainerStyle={
          mutedUsers.length === 0 ? styles.emptyList : styles.list
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    flex: 1,
    textAlign: "center",
  },
  headerRight: {
    width: 40, // Balance the back button
  },
  list: {
    padding: 16,
  },
  emptyList: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  userItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderRadius: 8,
    marginBottom: 8,
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatarText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  mutedDate: {
    fontSize: 12,
  },
  unmuteButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  unmuteText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 4,
  },
  emptyContainer: {
    alignItems: "center",
  },
  emptyIcon: {
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
});

export default MutedUsersScreen;

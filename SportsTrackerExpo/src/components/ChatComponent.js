import React, { useEffect, useRef, useState, useMemo } from "react";
import {
  View,
  FlatList,
  StyleSheet,
  Text,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
// import { KeyboardStickyView } from "react-native-keyboard-controller"; // Removed - requires New Architecture
import { useChat } from "../context/ChatContext";
import { useTheme } from "../context/ThemeContext";
import { useMutedUsers } from "../context/MutedUsersContext";
import ChatBubble from "./ChatBubble";
import MessageInput from "./MessageInput";
import ChatUtils from "../utils/ChatUtils";
import ModerationService from "../services/ModerationService";

const ChatComponent = ({
  gameId,
  gameName,
  gameData,
  hideHeader = false,
  disableKeyboardAvoidance = false,
}) => {
  const { theme, colors } = useTheme();
  const { isUserMuted } = useMutedUsers();
  const {
    subscribeToChatMessages,
    unsubscribeFromChatMessages,
    getChatMessages,
    sendMessage,
    userName,
  } = useChat();

  const flatListRef = useRef(null);
  const isSubscribedRef = useRef(false);
  const prevMessagesRef = useRef([]);
  const gameIdRef = useRef(gameId);

  // Get messages only once and memoize them
  const messages = useMemo(() => {
    return getChatMessages(gameId);
  }, [gameId, getChatMessages]);

  // Memoize the chat availability check to prevent infinite re-renders
  const isChatAvailable = useMemo(() => {
    return ChatUtils.isChatAvailable(gameData);
  }, [gameData]);

  const [filteredMessages, setFilteredMessages] = useState([]);
  const [userId] = useState(
    () => `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isSubscribedRef.current && gameId) {
        console.log("Component unmounting, cleaning up subscription");
        unsubscribeFromChatMessages(gameId);
        isSubscribedRef.current = false;
      }
    };
  }, []);

  useEffect(() => {
    // Track gameId changes and handle subscription
    if (gameIdRef.current !== gameId) {
      // Clean up previous subscription
      if (isSubscribedRef.current && gameIdRef.current) {
        console.log(
          "GameId changed, unsubscribing from old gameId:",
          gameIdRef.current
        );
        unsubscribeFromChatMessages(gameIdRef.current);
        isSubscribedRef.current = false;
      }
      gameIdRef.current = gameId;
    }

    if (gameId && !isSubscribedRef.current) {
      console.log("Subscribing to chat for gameId:", gameId);
      subscribeToChatMessages(gameId);
      isSubscribedRef.current = true;
    }
  }, [gameId]); // Remove function dependencies that cause re-renders

  useEffect(() => {
    // Only update filtered messages if they actually changed
    const messagesString = JSON.stringify(messages);
    const prevMessagesString = JSON.stringify(prevMessagesRef.current);

    if (messagesString !== prevMessagesString) {
      console.log(
        "Messages changed, updating filtered messages. Count:",
        messages.length
      );
      prevMessagesRef.current = [...messages]; // Create a new array to avoid reference issues

      // Filter out messages from muted users
      const nonMutedMessages = messages.filter((message) => {
        const messageUserName = message.userName;
        return !isUserMuted(messageUserName);
      });

      setFilteredMessages([...nonMutedMessages]); // Create a new array for state
      console.log(
        "Filtered messages (excluding muted users). Count:",
        nonMutedMessages.length
      );
    }

    // TODO: Re-enable when debugging is complete
    /*
    // Filter messages for blocked users and deleted messages
    const filterMessages = async () => {
      if (messages.length === 0) {
        setFilteredMessages([]);
        return;
      }
      
      try {
        const filtered = await ModerationService.filterMessages(messages, userId);
        setFilteredMessages(filtered);
      } catch (error) {
        console.error('Error filtering messages:', error);
        // Fallback to original messages if filtering fails
        setFilteredMessages(messages);
      }
    };
    
    filterMessages();
    */
  }, [messages]);

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    if (filteredMessages.length > 0 && flatListRef.current) {
      flatListRef.current.scrollToEnd({ animated: true });
    }
  }, [filteredMessages]);

  const handleSendMessage = async (messageText) => {
    if (!gameId || !messageText.trim()) return;

    try {
      // Temporarily disable moderation for debugging
      await sendMessage(gameId, messageText.trim());

      // TODO: Re-enable when debugging is complete
      /*
      // Check rate limit
      await ModerationService.checkRateLimit(userId, gameId);
      
      // Filter profanity
      const filteredText = ModerationService.filterProfanity(messageText);
      
      // Check if user is banned
      const isBanned = await ModerationService.isUserBanned(userId);
      if (isBanned) {
        throw new Error('You are banned from chatting');
      }
      
      await sendMessage(gameId, filteredText);
      */
    } catch (error) {
      console.error("Error sending message:", error);
      throw error;
    }
  };

  const handleUserBlocked = async (blockedUserId) => {
    // Re-filter messages after blocking a user
    const filtered = messages.filter((msg) => msg.userId !== blockedUserId);
    setFilteredMessages(filtered);
  };

  const handleMessageReported = (messageId, reason) => {
    // You could show a toast or update UI to indicate message was reported
    console.log(`Message ${messageId} reported for: ${reason}`);
  };

  const renderMessage = ({ item }) => {
    const isOwnMessage = item.userName === userName;

    return (
      <ChatBubble
        message={item}
        isOwnMessage={isOwnMessage}
        userName={item.userName}
        userColor={item.userColor}
        currentUserId={userId}
        onUserBlocked={handleUserBlocked}
        onMessageReported={handleMessageReported}
      />
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Text
        allowFontScaling={false}
        style={[styles.emptyText, { color: theme.textSecondary }]}
      >
        No messages yet. Be the first to start the conversation!
      </Text>
    </View>
  );

  const renderHeader = () => (
    <View
      style={[
        styles.header,
        { backgroundColor: theme.surface, borderBottomColor: theme.border },
      ]}
    >
      <Text
        allowFontScaling={false}
        style={[styles.headerTitle, { color: theme.text }]}
      >
        Chat
      </Text>
      {gameName && (
        <Text
          allowFontScaling={false}
          style={[styles.headerSubtitle, { color: theme.textSecondary }]}
        >
          {gameName}
        </Text>
      )}
    </View>
  );

  if (!gameId) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        {renderHeader()}
        <View style={styles.errorContainer}>
          <Text
            allowFontScaling={false}
            style={[styles.errorText, { color: theme.textSecondary }]}
          >
            Chat not available
          </Text>
        </View>
      </View>
    );
  }

  // If chat is not available for this game, show a message
  if (!isChatAvailable) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        {!hideHeader && renderHeader()}
        <View style={styles.unavailableContainer}>
          <Text
            allowFontScaling={false}
            style={[styles.unavailableText, { color: theme.textSecondary }]}
          >
            {ChatUtils.getChatUnavailableMessage(gameData)}
          </Text>
          <Text
            allowFontScaling={false}
            style={[styles.unavailableSubtext, { color: theme.textSecondary }]}
          >
            Chat is only available during game day to keep discussions relevant
            and manage storage efficiently.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {!hideHeader && renderHeader()}

      <View style={styles.messagesContainer}>
        <FlatList
          ref={flatListRef}
          data={filteredMessages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesList}
          ListEmptyComponent={renderEmptyState}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => {
            if (flatListRef.current && filteredMessages.length > 0) {
              flatListRef.current.scrollToEnd({ animated: false });
            }
          }}
        />
      </View>

      <View style={{ position: "absolute", bottom: 0, left: 0, right: 0 }}>
        <MessageInput onSendMessage={handleSendMessage} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesList: {
    flexGrow: 1,
    paddingVertical: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  errorText: {
    fontSize: 16,
    textAlign: "center",
  },
  unavailableContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  unavailableText: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 12,
    fontWeight: "500",
  },
  unavailableSubtext: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    fontStyle: "italic",
  },
});

export default ChatComponent;

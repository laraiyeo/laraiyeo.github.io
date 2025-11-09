import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Platform,
  Modal,
  Alert,
} from "react-native";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { useEmotes } from "../context/EmoteContext";
import { useChat } from "../context/ChatContext";
import { useMutedUsers } from "../context/MutedUsersContext";
import MessageActions from "./MessageActions";

const ChatBubble = ({
  message,
  isOwnMessage,
  userName,
  userColor,
  currentUserId,
  onUserBlocked,
  onMessageReported,
}) => {
  const { theme, colors } = useTheme();
  const { parseMessageForEmotes } = useEmotes();
  const { userName: currentUserName } = useChat();
  const { muteUser, isUserMuted } = useMutedUsers();
  const [actionsVisible, setActionsVisible] = useState(false);
  const [muteModalVisible, setMuteModalVisible] = useState(false);

  // Parse message for emotes and @mentions
  const parsedMessage = parseMessageForEmotes(message.text);

  // Check if message is emote-only (no text, only emotes)
  const isEmoteOnly = parsedMessage.every(
    (part) =>
      part.type === "emote" ||
      (part.type === "text" && part.content.trim() === "")
  );

  // Count emotes in the message (max 3)
  const emoteCount = Math.min(
    parsedMessage.filter((part) => part.type === "emote").length,
    3
  );

  // Check if current user is mentioned in the message
  const isMentioned =
    currentUserName &&
    message.text &&
    message.text.toLowerCase().includes(`@${currentUserName.toLowerCase()}`);

  const renderMessageContent = () => {
    let renderedEmotes = 0;

    return parsedMessage.map((part, index) => {
      if (part.type === "text") {
        // Check for @mentions in text
        const text = part.content;
        const mentionRegex = /@(\w+)/g;
        let lastIndex = 0;
        const elements = [];
        let match;

        while ((match = mentionRegex.exec(text)) !== null) {
          // Add text before mention
          if (match.index > lastIndex) {
            elements.push(
              <Text
                key={`text-${index}-${lastIndex}`}
                style={[styles.messageText, { color: theme.text }]}
              >
                {text.substring(lastIndex, match.index)}
              </Text>
            );
          }

          // Add mention with highlight
          const mentionedUser = match[1];
          const isCurrentUserMentioned =
            currentUserName &&
            mentionedUser.toLowerCase() === currentUserName.toLowerCase();

          elements.push(
            <Text
              key={`mention-${index}-${match.index}`}
              style={[
                styles.messageText,
                styles.mentionText,
                {
                  color: isCurrentUserMentioned ? colors.primary : theme.text,
                  fontWeight: "bold",
                },
              ]}
            >
              @{mentionedUser}
            </Text>
          );

          lastIndex = match.index + match[0].length;
        }

        // Add remaining text
        if (lastIndex < text.length) {
          elements.push(
            <Text
              key={`text-${index}-${lastIndex}`}
              style={[styles.messageText, { color: theme.text }]}
            >
              {text.substring(lastIndex)}
            </Text>
          );
        }

        return elements.length > 0 ? (
          elements
        ) : (
          <Text key={index} style={[styles.messageText, { color: theme.text }]}>
            {text}
          </Text>
        );
      } else if (part.type === "emote" && renderedEmotes < 3) {
        renderedEmotes++;
        const emote = part.content;

        // Handle unicode emojis (custom sports emotes)
        if (
          emote.type === "custom" &&
          typeof emote.url === "string" &&
          emote.url.length <= 2
        ) {
          return (
            <Text key={index} style={styles.emojiInMessage}>
              {emote.url}
            </Text>
          );
        }

        // Handle image emotes - use WebView for animation on mobile
        const imageUri = emote.cachedUrl || emote.url;

        if (Platform.OS === "web" || !imageUri.includes(".webp")) {
          // Use regular Image for web or non-WebP files
          return (
            <Image
              key={index}
              source={{
                uri: imageUri,
                cache: "force-cache",
              }}
              style={styles.emoteInMessage}
              resizeMode="contain"
              fadeDuration={0}
            />
          );
        } else {
          // Use WebView for animated WebP on mobile
          return (
            <WebView
              key={index}
              source={{
                html: `
                  <html>
                    <head>
                      <meta name="viewport" content="width=device-width, initial-scale=1.0">
                      <style>
                        * { margin: 0; padding: 0; }
                        html, body { 
                          display: flex; 
                          justify-content: center; 
                          align-items: center; 
                          height: 100vh; 
                          background: transparent !important;
                          background-color: transparent !important;
                          overflow: hidden;
                        }
                        img { 
                          width: 30px; 
                          height: 30px; 
                          object-fit: contain; 
                          display: block;
                          background: transparent !important;
                          background-color: transparent !important;
                        }
                      </style>
                    </head>
                    <body style="background: transparent !important; background-color: transparent !important;">
                      <img src="${imageUri}" alt="emote" style="background: transparent !important; background-color: transparent !important;" />
                    </body>
                  </html>
                `,
              }}
              style={[styles.emoteInMessage, { backgroundColor: 'transparent' }]}
              scrollEnabled={false}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              pointerEvents="none"
              javaScriptEnabled={false}
              domStorageEnabled={false}
              startInLoadingState={false}
              cacheEnabled={true}
              backgroundColor="transparent"
              opacity={0.99}
            />
          );
        }
      }

      return null;
    });
  };

  const handleLongPress = () => {
    console.log("🔗 Long press detected!", { isOwnMessage, userName });
    if (!isOwnMessage) {
      setActionsVisible(true);
    }
  };

  const handlePress = () => {
    console.log("🔗 Press detected!", { isOwnMessage, userName });
    if (!isOwnMessage) {
      setMuteModalVisible(true);
    }
  };

  const handleUserBlocked = (blockedUserId) => {
    onUserBlocked?.(blockedUserId);
  };

  const handleMessageReported = (messageId, reason) => {
    onMessageReported?.(messageId, reason);
  };

  return (
    <TouchableOpacity
      style={[
        styles.container,
        isOwnMessage ? styles.ownMessage : styles.otherMessage,
      ]}
      onPress={handlePress}
      onLongPress={handleLongPress}
      delayLongPress={300} // Reduced from 500ms for better UX
      activeOpacity={0.8}
      disabled={isOwnMessage} // Disable touch for own messages
    >
      {!isOwnMessage && (
        <Text
          allowFontScaling={false}
          style={[styles.userName, { color: userColor || "#666" }]}
        >
          {userName}
        </Text>
      )}

      <View
        style={[
          styles.bubble,
          {
            backgroundColor: isOwnMessage
              ? theme.surfaceSecondary
              : theme.surface,
            borderColor: isMentioned ? colors.primary : theme.border,
            borderWidth: isMentioned ? 2 : 1,
            // Dynamic width calculation
            maxWidth:
              emoteCount > 0
                ? `${Math.min(80 + emoteCount * 32, 90)}%` // Add emote width to base percentage
                : "80%",
            minWidth: emoteCount > 0 ? `${emoteCount * 32 + 24}px` : "20%",
          },
        ]}
      >
        <View
          style={[
            styles.messageContent,
            {
              justifyContent: "flex-start",
              width: "100%", // Use full available width
              minWidth: emoteCount > 0 ? emoteCount * 34 : 0, // Account for emote + margin
            },
          ]}
        >
          {renderMessageContent()}
        </View>

        <Text
          allowFontScaling={false}
          style={[styles.timestamp, { color: theme.textSecondary }]}
        >
          {message.timestamp
            ? new Date(message.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
            : ""}
        </Text>
      </View>

      <MessageActions
        visible={actionsVisible}
        onClose={() => {
          console.log("🔗 MessageActions closing");
          setActionsVisible(false);
        }}
        message={{
          ...message,
          userId: message.userId || currentUserId,
          userName: userName,
          gameId: message.gameId, // Make sure gameId is passed through
        }}
        currentUserId={currentUserId}
        onBlock={handleUserBlocked}
        onReport={handleMessageReported}
      />

      {/* Mute User Modal */}
      <Modal
        visible={muteModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setMuteModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setMuteModalVisible(false)}
        >
          <TouchableOpacity
            style={[
              styles.muteModalContent,
              { backgroundColor: theme.background },
            ]}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            <View
              style={[
                styles.muteModalHeader,
                { borderBottomColor: theme.border },
              ]}
            >
              <Text style={[styles.muteModalTitle, { color: theme.text }]}>
                Mute User
              </Text>
              <TouchableOpacity
                onPress={() => setMuteModalVisible(false)}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.muteModalBody}>
              <Text style={[styles.muteModalMessage, { color: theme.text }]}>
                Do you want to mute{" "}
                <Text
                  style={{
                    fontWeight: "bold",
                    color: userColor || colors.primary,
                  }}
                >
                  {userName}
                </Text>
                ?
              </Text>
              <Text
                style={[
                  styles.muteModalSubtext,
                  { color: theme.textSecondary },
                ]}
              >
                You won't see messages from this user anymore. You can unmute
                them in Settings.
              </Text>
            </View>

            <View style={styles.muteModalButtons}>
              <TouchableOpacity
                style={[styles.cancelButton, { borderColor: theme.border }]}
                onPress={() => setMuteModalVisible(false)}
              >
                <Text style={[styles.cancelButtonText, { color: theme.text }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.muteButton, { backgroundColor: theme.error }]}
                onPress={async () => {
                  try {
                    await muteUser(userName);
                    setMuteModalVisible(false);
                    console.log("✅ Successfully muted user:", userName);
                  } catch (error) {
                    console.error("❌ Error muting user:", error);
                    setMuteModalVisible(false);
                  }
                }}
              >
                <Text style={styles.muteButtonText}>Mute</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    marginHorizontal: 12,
  },
  ownMessage: {
    alignItems: "flex-end",
  },
  otherMessage: {
    alignItems: "flex-start",
  },
  userName: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 2,
    marginHorizontal: 8,
  },
  bubble: {
    maxWidth: "80%",
    minWidth: "20%", // Ensure minimum width for emotes
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
    flexShrink: 1, // Allow text to shrink
  },
  messageContent: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    minWidth: 0, // Allow content to determine width
  },
  emoteInMessage: {
    width: 30, // Increased from 20 to 24
    height: 30, // Increased from 20 to 24
    marginHorizontal: 2,
    flexShrink: 0, // Prevent emotes from shrinking
  },
  emojiInMessage: {
    fontSize: 16,
    marginHorizontal: 1,
  },
  mentionText: {
    // No additional styles needed, handled inline
  },
  timestamp: {
    fontSize: 10,
    marginTop: 4,
    alignSelf: "flex-end",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  muteModalContent: {
    width: "85%",
    maxWidth: 400,
    borderRadius: 12,
    overflow: "hidden",
  },
  muteModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  muteModalTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  closeButton: {
    padding: 4,
  },
  muteModalBody: {
    padding: 20,
  },
  muteModalMessage: {
    fontSize: 16,
    marginBottom: 8,
    textAlign: "center",
  },
  muteModalSubtext: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  muteModalButtons: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "500",
  },
  muteButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  muteButtonText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#fff",
  },
});

export default ChatBubble;

import React, { useEffect, useRef } from 'react';
import { View, FlatList, StyleSheet, Text, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useChat } from '../context/ChatContext';
import { useTheme } from '../context/ThemeContext';
import ChatBubble from './ChatBubble';
import MessageInput from './MessageInput';
import ChatUtils from '../utils/ChatUtils';

const ChatComponent = ({ gameId, gameName, gameData, hideHeader = false }) => {
  const { theme, colors } = useTheme();
  const { 
    subscribeToChatMessages, 
    unsubscribeFromChatMessages, 
    getChatMessages, 
    sendMessage,
    userName 
  } = useChat();
  
  const flatListRef = useRef(null);
  const messages = getChatMessages(gameId);
  const isChatAvailable = ChatUtils.isChatAvailable(gameData);

  useEffect(() => {
    if (gameId) {
      subscribeToChatMessages(gameId);
    }

    return () => {
      if (gameId) {
        unsubscribeFromChatMessages(gameId);
      }
    };
  }, [gameId]);

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    if (messages.length > 0 && flatListRef.current) {
      flatListRef.current.scrollToEnd({ animated: true });
    }
  }, [messages]);

  const handleSendMessage = async (messageText) => {
    if (!gameId || !messageText.trim()) return;
    
    try {
      await sendMessage(gameId, messageText);
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  };

  const renderMessage = ({ item }) => {
    const isOwnMessage = item.userName === userName;
    
    return (
      <ChatBubble
        message={item}
        isOwnMessage={isOwnMessage}
        userName={item.userName}
        userColor={item.userColor}
      />
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Text allowFontScaling={false} style={[styles.emptyText, { color: theme.textSecondary }]}>
        No messages yet. Be the first to start the conversation!
      </Text>
    </View>
  );

  const renderHeader = () => (
    <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
      <Text allowFontScaling={false} style={[styles.headerTitle, { color: theme.text }]}>
        Chat
      </Text>
      {gameName && (
        <Text allowFontScaling={false} style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
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
          <Text allowFontScaling={false} style={[styles.errorText, { color: theme.textSecondary }]}>
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
          <Text allowFontScaling={false} style={[styles.unavailableText, { color: theme.textSecondary }]}>
            {ChatUtils.getChatUnavailableMessage(gameData)}
          </Text>
          <Text allowFontScaling={false} style={[styles.unavailableSubtext, { color: theme.textSecondary }]}>
            Chat is only available during game day to keep discussions relevant and manage storage efficiently.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      {!hideHeader && renderHeader()}
      
      <View style={styles.messagesContainer}>
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesList}
          ListEmptyComponent={renderEmptyState}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => {
            if (flatListRef.current && messages.length > 0) {
              flatListRef.current.scrollToEnd({ animated: false });
            }
          }}
        />
      </View>
      
      <MessageInput onSendMessage={handleSendMessage} />
    </KeyboardAvoidingView>
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
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
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
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
  },
  unavailableContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  unavailableText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 12,
    fontWeight: '500',
  },
  unavailableSubtext: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    fontStyle: 'italic',
  },
});

export default ChatComponent;
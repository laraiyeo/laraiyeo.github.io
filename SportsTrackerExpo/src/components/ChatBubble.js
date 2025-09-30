import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

const ChatBubble = ({ message, isOwnMessage, userName, userColor }) => {
  const { theme } = useTheme();

  return (
    <View style={[
      styles.container,
      isOwnMessage ? styles.ownMessage : styles.otherMessage
    ]}>
      {!isOwnMessage && (
        <Text allowFontScaling={false} style={[
          styles.userName,
          { color: userColor || '#666' }
        ]}>
          {userName}
        </Text>
      )}
      
      <View style={[
        styles.bubble,
        {
          backgroundColor: isOwnMessage ? theme.surfaceSecondary : theme.surface,
          borderColor: theme.border,
        }
      ]}>
        <Text allowFontScaling={false} style={[
          styles.messageText,
          { color: theme.text }
        ]}>
          {message.text}
        </Text>
        
        <Text allowFontScaling={false} style={[
          styles.timestamp,
          { color: theme.textSecondary }
        ]}>
          {message.timestamp ? new Date(message.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
          }) : ''}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    marginHorizontal: 12,
  },
  ownMessage: {
    alignItems: 'flex-end',
  },
  otherMessage: {
    alignItems: 'flex-start',
  },
  userName: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
    marginHorizontal: 8,
  },
  bubble: {
    maxWidth: '80%',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 18,
  },
  timestamp: {
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
});

export default ChatBubble;
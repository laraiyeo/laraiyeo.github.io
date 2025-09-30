import React, { useState, useEffect, useRef } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, Alert, Keyboard, Dimensions, Animated, Platform, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

const MessageInput = ({ onSendMessage, disabled = false }) => {
  const { theme, colors } = useTheme();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [screenHeight] = useState(Dimensions.get('window').height);
  const [cooldownActive, setCooldownActive] = useState(false);
  const [cooldownTimer, setCooldownTimer] = useState(0);
  const floatingInputAnimationRef = useRef(new Animated.Value(0));
  const cooldownIntervalRef = useRef(null);
  const floatingInputAnimation = floatingInputAnimationRef.current;

  // Enhanced keyboard listeners for accurate positioning
  useEffect(() => {
    const showHandler = (e) => {
      if (e?.endCoordinates?.height) {
        setKeyboardHeight(e.endCoordinates.height);
        setIsKeyboardVisible(true);
      }
    };

    const hideHandler = () => {
      setKeyboardHeight(0);
      setIsKeyboardVisible(false);
    };

    // Use more accurate keyboard events when available
    let showEvent = 'keyboardDidShow';
    let hideEvent = 'keyboardDidHide';
    
    if (Platform.OS === 'ios') {
      showEvent = 'keyboardWillShow';
      hideEvent = 'keyboardWillHide';
    }

    const showSub = Keyboard.addListener(showEvent, showHandler);
    const hideSub = Keyboard.addListener(hideEvent, hideHandler);

    return () => {
      showSub?.remove?.();
      hideSub?.remove?.();
    };
  }, []);

  // Cleanup cooldown timer on unmount
  useEffect(() => {
    return () => {
      if (cooldownIntervalRef.current) {
        clearInterval(cooldownIntervalRef.current);
      }
    };
  }, []);

  // Animate floating input when focus changes
  useEffect(() => {
    if (inputFocused) {
      // fallback: if keyboard events don't fire (web), treat focus as visible
      if (!isKeyboardVisible) setIsKeyboardVisible(true);
      Animated.timing(floatingInputAnimation, {
        toValue: 1,
        duration: 120,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(floatingInputAnimation, {
        toValue: 0,
        duration: 120,
        useNativeDriver: true,
      }).start();
    }
  }, [inputFocused]);

  // Immediate focus/blur helpers to reduce perceived delay
  const handleFocusImmediate = () => {
    setInputFocused(true);
    setIsKeyboardVisible(true);
    // Make the floating input visible immediately
    floatingInputAnimationRef.current.setValue(1);
  };

  const handleBlurImmediate = () => {
    setInputFocused(false);
    // Animate out quickly
    Animated.timing(floatingInputAnimation, {
      toValue: 0,
      duration: 100,
      useNativeDriver: true,
    }).start(() => {
      setIsKeyboardVisible(false);
    });
  };

  const handleSend = async () => {
    if (!message.trim() || sending || disabled || cooldownActive) return;

    setSending(true);
    try {
      await onSendMessage(message.trim());
      setMessage('');
      setInputFocused(false);
      Keyboard.dismiss();
      
      // Start 5-second cooldown
      startCooldown();
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert('Error', 'Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const startCooldown = () => {
    setCooldownActive(true);
    setCooldownTimer(5);
    
    cooldownIntervalRef.current = setInterval(() => {
      setCooldownTimer((prev) => {
        if (prev <= 1) {
          clearInterval(cooldownIntervalRef.current);
          setCooldownActive(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  return (
    <>
      <View style={[styles.container, { 
        backgroundColor: theme.surface,
        borderTopColor: theme.border,
        paddingBottom: 20 // Added extra padding at bottom
      }]}>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: theme.background,
              color: theme.text,
              borderColor: theme.border,
            }
          ]}
          value={message}
          onChangeText={setMessage}
          placeholder="Type a message..."
          placeholderTextColor={theme.textSecondary}
          multiline={true}
          maxLength={500}
          editable={!disabled && !sending && !cooldownActive}
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
          onFocus={handleFocusImmediate}
          onBlur={handleBlurImmediate}
        />
        
        <TouchableOpacity
          style={[
            styles.sendButton,
            {
              backgroundColor: message.trim() && !sending && !disabled && !cooldownActive
                ? colors.primary 
                : theme.border,
            }
          ]}
          onPress={handleSend}
          disabled={!message.trim() || sending || disabled || cooldownActive}
          activeOpacity={0.7}
        >
          {cooldownActive ? (
            <Text style={[styles.cooldownText, { color: theme.textSecondary }]}>
              {cooldownTimer}
            </Text>
          ) : (
            <Ionicons 
              name="send" 
              size={18} 
              color={message.trim() && !sending && !disabled && !cooldownActive ? '#fff' : theme.textSecondary} 
            />
          )}
        </TouchableOpacity>
      </View>

      {/* Floating Input Above Keyboard (render whenever input is focused) */}
      {inputFocused && (
        <Animated.View
          style={[
            styles.floatingInputContainer,
            {
              backgroundColor: theme.surface,
              borderTopColor: theme.border,
              // Position exactly at keyboard top - no fallback guessing needed
              bottom: keyboardHeight - 20,
              opacity: floatingInputAnimation,
              zIndex: 999,
              elevation: 999,
              pointerEvents: 'box-none',
              transform: [
                {
                  translateY: floatingInputAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [50, 0], // Smaller initial offset for smoother animation
                  }),
                },
              ],
            }
          ]}
          pointerEvents="box-none"
        >
          <View style={[styles.floatingInputContent, { backgroundColor: theme.surface }]}>
            <TextInput
              style={[
                styles.floatingInput,
                {
                  backgroundColor: theme.background,
                  color: theme.text,
                  borderColor: theme.border,
                }
              ]}
              value={message}
              onChangeText={setMessage}
              placeholder="Type a message..."
              placeholderTextColor={theme.textSecondary}
              multiline={true}
              maxLength={500}
              editable={!disabled && !sending && !cooldownActive}
              autoFocus={false}
            />
            
            <TouchableOpacity
              style={[
                styles.floatingSendButton,
                {
                  backgroundColor: message.trim() && !sending && !disabled && !cooldownActive
                    ? colors.primary 
                    : theme.border,
                }
              ]}
              onPress={handleSend}
              disabled={!message.trim() || sending || disabled || cooldownActive}
              activeOpacity={0.7}
            >
              {cooldownActive ? (
                <Text style={[styles.cooldownText, { color: theme.textSecondary }]}>
                  {cooldownTimer}
                </Text>
              ) : (
                <Ionicons 
                  name="send" 
                  size={18} 
                  color={message.trim() && !sending && !disabled && !cooldownActive ? '#fff' : theme.textSecondary} 
                />
              )}
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 8,
    maxHeight: 100,
    fontSize: 14,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingInputContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 1,
    paddingTop: 8,
    paddingBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  floatingInputContent: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
  },
  floatingInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 8,
    maxHeight: 100,
    fontSize: 14,
  },
  floatingSendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cooldownText: {
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});

export default MessageInput;
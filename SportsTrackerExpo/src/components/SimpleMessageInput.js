import React, { useState, useRef } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Text,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import EmotePicker from "./EmotePicker";

const SimpleMessageInput = ({ onSendMessage, disabled = false }) => {
  const { theme, colors } = useTheme();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [cooldownActive, setCooldownActive] = useState(false);
  const [cooldownTimer, setCooldownTimer] = useState(0);
  const [emotePickerVisible, setEmotePickerVisible] = useState(false);
  const cooldownIntervalRef = useRef(null);

  const startCooldown = () => {
    setCooldownActive(true);
    setCooldownTimer(3);

    cooldownIntervalRef.current = setInterval(() => {
      setCooldownTimer((prev) => {
        if (prev <= 1) {
          setCooldownActive(false);
          clearInterval(cooldownIntervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSend = async () => {
    if (!message.trim() || sending || disabled || cooldownActive) {
      return;
    }

    try {
      setSending(true);
      await onSendMessage(message.trim());
      setMessage("");
      startCooldown();
    } catch (error) {
      console.error("Error sending message:", error);
      Alert.alert("Error", "Failed to send message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const handleEmoteSelect = (emote) => {
    setMessage((prev) => prev + emote.code);
    setEmotePickerVisible(false);
  };

  const toggleEmotePicker = () => {
    setEmotePickerVisible(!emotePickerVisible);
  };

  return (
    <>
      <View
        style={[
          styles.container,
          {
            backgroundColor: theme.surface,
            borderTopColor: theme.border,
          },
        ]}
      >
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: theme.background,
              color: theme.text,
              borderColor: theme.border,
            },
          ]}
          value={message}
          onChangeText={setMessage}
          placeholder="Type a message..."
          placeholderTextColor={theme.textSecondary}
          multiline={true}
          maxLength={150}
          editable={!disabled && !sending && !cooldownActive}
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
        />

        {/* Emote Button */}
        <TouchableOpacity
          style={[
            styles.emoteButton,
            { backgroundColor: theme.background, borderColor: theme.border },
          ]}
          onPress={toggleEmotePicker}
          disabled={disabled}
          activeOpacity={0.7}
        >
          <Ionicons
            name="happy-outline"
            size={20}
            color={theme.textSecondary}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.sendButton,
            {
              backgroundColor:
                message.trim() && !sending && !disabled && !cooldownActive
                  ? colors.primary
                  : theme.border,
            },
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
              color={
                message.trim() && !sending && !disabled && !cooldownActive
                  ? "#fff"
                  : theme.textSecondary
              }
            />
          )}
        </TouchableOpacity>
      </View>

      {/* Emote Picker */}
      <EmotePicker
        visible={emotePickerVisible}
        onClose={() => setEmotePickerVisible(false)}
        onEmoteSelect={handleEmoteSelect}
      />
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxHeight: 100,
    fontSize: 16,
  },
  emoteButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  cooldownText: {
    fontSize: 14,
    fontWeight: "600",
  },
});

export default SimpleMessageInput;

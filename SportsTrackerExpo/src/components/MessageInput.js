import React, { useState, useEffect, useRef } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Text,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import EmotePicker from "./EmotePicker";

const MessageInput = ({ onSendMessage, disabled = false }) => {
  const { theme, colors } = useTheme();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [cooldownActive, setCooldownActive] = useState(false);
  const [cooldownTimer, setCooldownTimer] = useState(0);
  const [emotePickerVisible, setEmotePickerVisible] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const cooldownIntervalRef = useRef(null);

  // Cleanup cooldown timer on unmount
  useEffect(() => {
    return () => {
      if (cooldownIntervalRef.current) {
        clearInterval(cooldownIntervalRef.current);
      }
    };
  }, []);

  const handleSend = async () => {
    if (!message.trim() || sending || disabled || cooldownActive) return;

    setSending(true);
    try {
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

  const handleEmoteSelect = (emote) => {
    setMessage((prev) => prev + emote.name + " ");
    setEmotePickerVisible(false);
  };

  const toggleEmotePicker = () => {
    setEmotePickerVisible(!emotePickerVisible);
  };

  const handleTypeButtonPress = () => {
    setIsModalVisible(true);
  };

  const handleCloseModal = () => {
    setIsModalVisible(false);
    setMessage("");
    setEmotePickerVisible(false);
  };

  const handleSendAndClose = async () => {
    if (!message.trim() || sending || disabled || cooldownActive) return;

    setSending(true);
    try {
      await onSendMessage(message.trim());
      setMessage("");
      setIsModalVisible(false);
      setEmotePickerVisible(false);
      startCooldown();
    } catch (error) {
      console.error("Error sending message:", error);
      Alert.alert("Error", "Failed to send message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {/* Always show the Type button */}
      <View
        style={[
          styles.collapsedContainer,
          {
            backgroundColor: theme.surface,
            borderTopColor: theme.border,
          },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.typeButton,
            {
              backgroundColor: colors.secondary,
            },
          ]}
          onPress={handleTypeButtonPress}
          disabled={disabled}
          activeOpacity={0.8}
        >
          <Text style={[styles.typeButtonText, { color: "#fff" }]}>Type</Text>
        </TouchableOpacity>
      </View>

      {/* Modal for message input */}
      <Modal
        visible={isModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={handleCloseModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalContainer}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={handleCloseModal}
          >
            <TouchableOpacity
              style={[styles.modalContent, { backgroundColor: theme.surface }]}
              activeOpacity={1}
              onPress={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <View
                style={[
                  styles.modalHeader,
                  { borderBottomColor: theme.border },
                ]}
              >
                <Text style={[styles.modalTitle, { color: theme.text }]}>
                  Send Message
                </Text>
                <TouchableOpacity
                  onPress={handleCloseModal}
                  style={styles.closeButton}
                >
                  <Text
                    style={[
                      styles.closeButtonText,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Message Input Area */}
              <View style={styles.modalBody}>
                <View style={styles.inputRow}>
                  <TextInput
                    style={[
                      styles.modalInput,
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
                    autoFocus={true}
                  />

                  {/* Emote Button */}
                  <TouchableOpacity
                    style={[
                      styles.emoteButton,
                      {
                        backgroundColor: theme.background,
                        borderColor: theme.border,
                      },
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
                </View>

                {/* Send Button */}
                <TouchableOpacity
                  style={[
                    styles.modalSendButton,
                    {
                      backgroundColor:
                        message.trim() &&
                        !sending &&
                        !disabled &&
                        !cooldownActive
                          ? colors.secondary
                          : theme.border,
                    },
                  ]}
                  onPress={handleSendAndClose}
                  disabled={
                    !message.trim() || sending || disabled || cooldownActive
                  }
                  activeOpacity={0.7}
                >
                  {cooldownActive ? (
                    <Text
                      style={[
                        styles.cooldownText,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {cooldownTimer}
                    </Text>
                  ) : (
                    <Text
                      style={[
                        styles.sendButtonText,
                        {
                          color:
                            message.trim() &&
                            !sending &&
                            !disabled &&
                            !cooldownActive
                              ? "#fff"
                              : theme.textSecondary,
                        },
                      ]}
                    >
                      Send
                    </Text>
                  )}
                </TouchableOpacity>
              </View>

              {/* Emote Picker - inside modal */}
              <EmotePicker
                visible={emotePickerVisible}
                onClose={() => setEmotePickerVisible(false)}
                onEmoteSelect={handleEmoteSelect}
              />
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  // Type button (always visible at bottom)
  collapsedContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  typeButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
    minWidth: 80,
    alignItems: "center",
    justifyContent: "center",
  },
  typeButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },

  // Modal styles
  modalContainer: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "50%",
    minHeight: "30%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  closeButton: {
    padding: 4,
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: "500",
  },
  modalBody: {
    padding: 20,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginBottom: 16,
  },
  modalInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginRight: 12,
    maxHeight: 120,
    fontSize: 16,
    textAlignVertical: "top",
  },
  emoteButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  modalSendButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  sendButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  cooldownText: {
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
  },
});

export default MessageInput;

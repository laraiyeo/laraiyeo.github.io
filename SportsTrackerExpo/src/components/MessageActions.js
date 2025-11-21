import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import ModerationService from "../services/ModerationService";

const MessageActions = ({
  visible,
  onClose,
  message,
  currentUserId,
  onBlock,
  onReport,
}) => {
  const { theme, colors } = useTheme();
  const [reportModalVisible, setReportModalVisible] = useState(false);

  const handleBlock = async () => {
    try {
      if (message.userId === currentUserId) {
        Alert.alert("Error", "You cannot block yourself");
        return;
      }

      Alert.alert(
        "Block User",
        `Are you sure you want to block ${message.userName}? You won't see their messages anymore.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Block",
            style: "destructive",
            onPress: async () => {
              try {
                await ModerationService.blockUser(
                  message.userId,
                  message.userName
                );
                onBlock?.(message.userId);
                onClose();
                Alert.alert("Success", `${message.userName} has been blocked`);
              } catch (error) {
                Alert.alert("Error", "Failed to block user");
              }
            },
          },
        ]
      );
    } catch (error) {
      console.error("Error blocking user:", error);
      Alert.alert("Error", "Failed to block user");
    }
  };

  const handleReport = () => {
    setReportModalVisible(true);
  };

  const submitReport = async (reason, description) => {
    try {
      await ModerationService.reportMessage(
        message.id,
        message.gameId,
        currentUserId,
        reason,
        description
      );

      setReportModalVisible(false);
      onClose();
      onReport?.(message.id, reason);
      Alert.alert("Success", "Message reported successfully");
    } catch (error) {
      Alert.alert("Error", "Failed to report message");
    }
  };

  const reportReasons = [
    {
      key: ModerationService.REPORT_REASONS.SPAM,
      label: "Spam",
      icon: "repeat-outline",
    },
    {
      key: ModerationService.REPORT_REASONS.HARASSMENT,
      label: "Harassment",
      icon: "warning-outline",
    },
    {
      key: ModerationService.REPORT_REASONS.INAPPROPRIATE,
      label: "Inappropriate Content",
      icon: "eye-off-outline",
    },
    {
      key: ModerationService.REPORT_REASONS.HATE_SPEECH,
      label: "Hate Speech",
      icon: "ban-outline",
    },
    {
      key: ModerationService.REPORT_REASONS.OTHER,
      label: "Other",
      icon: "ellipsis-horizontal-outline",
    },
  ];

  if (!message || message.userId === currentUserId) {
    return null;
  }

  return (
    <>
      <Modal
        visible={visible}
        transparent={true}
        animationType="fade"
        onRequestClose={onClose}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={onClose}
        >
          <View
            style={[styles.actionSheet, { backgroundColor: theme.surface }]}
          >
            <View style={[styles.header, { borderBottomColor: theme.border }]}>
              <Text style={[styles.headerTitle, { color: theme.text }]}>
                Message from {message.userName}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.actionButton, { borderBottomColor: theme.border }]}
              onPress={handleBlock}
            >
              <Ionicons
                name="person-remove-outline"
                size={20}
                color={theme.error}
              />
              <Text style={[styles.actionText, { color: theme.error }]}>
                Block User
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, { borderBottomColor: theme.border }]}
              onPress={handleReport}
            >
              <Ionicons name="flag-outline" size={20} color={theme.warning} />
              <Text style={[styles.actionText, { color: theme.warning }]}>
                Report Message
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={[styles.cancelText, { color: theme.text }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Report Modal */}
      <ReportModal
        visible={reportModalVisible}
        onClose={() => setReportModalVisible(false)}
        onSubmit={submitReport}
        reasons={reportReasons}
        message={message}
      />
    </>
  );
};

const ReportModal = ({ visible, onClose, onSubmit, reasons, message }) => {
  const { theme, colors } = useTheme();
  const [selectedReason, setSelectedReason] = useState(null);

  const handleSubmit = () => {
    if (!selectedReason) {
      Alert.alert("Error", "Please select a reason for reporting");
      return;
    }

    onSubmit(selectedReason, "");
    setSelectedReason(null);
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.reportOverlay}>
        <View
          style={[styles.reportModal, { backgroundColor: theme.background }]}
        >
          <View
            style={[styles.reportHeader, { borderBottomColor: theme.border }]}
          >
            <Text style={[styles.reportTitle, { color: theme.text }]}>
              Report Message
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={theme.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.reasonsList}>
            <Text style={[styles.reasonsTitle, { color: theme.textSecondary }]}>
              Why are you reporting this message?
            </Text>

            {reasons.map((reason) => (
              <TouchableOpacity
                key={reason.key}
                style={[
                  styles.reasonOption,
                  {
                    backgroundColor:
                      selectedReason === reason.key
                        ? colors.primary + "20"
                        : "transparent",
                    borderColor: theme.border,
                  },
                ]}
                onPress={() => setSelectedReason(reason.key)}
              >
                <Ionicons
                  name={reason.icon}
                  size={20}
                  color={
                    selectedReason === reason.key
                      ? colors.primary
                      : theme.textSecondary
                  }
                />
                <Text
                  style={[
                    styles.reasonText,
                    {
                      color:
                        selectedReason === reason.key
                          ? colors.primary
                          : theme.text,
                    },
                  ]}
                >
                  {reason.label}
                </Text>
                {selectedReason === reason.key && (
                  <Ionicons name="checkmark" size={20} color={colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View
            style={[styles.reportActions, { borderTopColor: theme.border }]}
          >
            <TouchableOpacity
              style={[styles.reportCancelButton, { borderColor: theme.border }]}
              onPress={onClose}
            >
              <Text style={[styles.reportCancelText, { color: theme.text }]}>
                Cancel
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.reportSubmitButton,
                {
                  backgroundColor: selectedReason ? theme.error : theme.border,
                },
              ]}
              onPress={handleSubmit}
              disabled={!selectedReason}
            >
              <Text
                style={[
                  styles.reportSubmitText,
                  {
                    color: selectedReason ? "#fff" : theme.textSecondary,
                  },
                ]}
              >
                Report
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  actionSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 20,
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actionText: {
    fontSize: 16,
    marginLeft: 15,
    fontWeight: "500",
  },
  cancelButton: {
    paddingVertical: 15,
    alignItems: "center",
  },
  cancelText: {
    fontSize: 16,
    fontWeight: "600",
  },

  // Report Modal Styles
  reportOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  reportModal: {
    borderRadius: 12,
    maxHeight: "80%",
  },
  reportHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
  },
  reportTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  reasonsList: {
    padding: 20,
  },
  reasonsTitle: {
    fontSize: 14,
    marginBottom: 15,
    textAlign: "center",
  },
  reasonOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 15,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 10,
  },
  reasonText: {
    fontSize: 16,
    marginLeft: 15,
    flex: 1,
  },
  reportActions: {
    flexDirection: "row",
    borderTopWidth: 1,
    padding: 20,
    gap: 10,
  },
  reportCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
  },
  reportCancelText: {
    fontSize: 16,
    fontWeight: "500",
  },
  reportSubmitButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  reportSubmitText: {
    fontSize: 16,
    fontWeight: "600",
  },
});

export default MessageActions;

import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  deleteDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../config/firebase";
import AsyncStorage from "@react-native-async-storage/async-storage";

export class ModerationService {
  // Report reasons
  static REPORT_REASONS = {
    SPAM: "spam",
    HARASSMENT: "harassment",
    INAPPROPRIATE: "inappropriate",
    HATE_SPEECH: "hate_speech",
    OTHER: "other",
  };

  // User roles
  static USER_ROLES = {
    USER: "user",
    MODERATOR: "moderator",
    ADMIN: "admin",
  };

  /**
   * Block a user (client-side only, doesn't affect others)
   */
  static async blockUser(userId, userName) {
    try {
      const blockedUsers = await this.getBlockedUsers();

      // Check if user is already blocked
      if (blockedUsers.some((user) => user.userId === userId)) {
        console.log("User already blocked");
        return true;
      }

      const newBlockedUsers = [
        ...blockedUsers,
        { userId, userName, blockedAt: Date.now() },
      ];

      await AsyncStorage.setItem(
        "blockedUsers",
        JSON.stringify(newBlockedUsers)
      );
      console.log(`User ${userName} blocked successfully`);
      return true;
    } catch (error) {
      console.error("Error blocking user:", error);
      throw error;
    }
  }

  /**
   * Unblock a user
   */
  static async unblockUser(userId) {
    try {
      const blockedUsers = await this.getBlockedUsers();
      const filteredUsers = blockedUsers.filter(
        (user) => user.userId !== userId
      );

      await AsyncStorage.setItem("blockedUsers", JSON.stringify(filteredUsers));
      console.log(`User unblocked successfully`);
      return true;
    } catch (error) {
      console.error("Error unblocking user:", error);
      throw error;
    }
  }

  /**
   * Get list of blocked users
   */
  static async getBlockedUsers() {
    try {
      const blocked = await AsyncStorage.getItem("blockedUsers");
      return blocked ? JSON.parse(blocked) : [];
    } catch (error) {
      console.error("Error getting blocked users:", error);
      return [];
    }
  }

  /**
   * Check if a user is blocked
   */
  static async isUserBlocked(userId) {
    try {
      const blockedUsers = await this.getBlockedUsers();
      return blockedUsers.some((user) => user.userId === userId);
    } catch (error) {
      console.error("Error checking if user blocked:", error);
      return false;
    }
  }

  /**
   * Report a message
   */
  static async reportMessage(
    messageId,
    gameId,
    reportedBy,
    reason,
    description = ""
  ) {
    try {
      const reportData = {
        messageId,
        gameId,
        reportedBy,
        reason,
        description,
        status: "pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const reportRef = doc(collection(db, "reports"));
      await setDoc(reportRef, reportData);

      return reportRef.id;
    } catch (error) {
      console.error("Error reporting message:", error);
      throw error;
    }
  }

  /**
   * Get user role (for moderation features)
   */
  static async getUserRole(userId) {
    try {
      const userDoc = await getDoc(doc(db, "users", userId));
      if (userDoc.exists()) {
        return userDoc.data().role || this.USER_ROLES.USER;
      }
      return this.USER_ROLES.USER;
    } catch (error) {
      console.error("Error getting user role:", error);
      return this.USER_ROLES.USER;
    }
  }

  /**
   * Set user role (admin only)
   */
  static async setUserRole(userId, role, adminUserId) {
    try {
      // Verify admin has permission
      const adminRole = await this.getUserRole(adminUserId);
      if (adminRole !== this.USER_ROLES.ADMIN) {
        throw new Error("Insufficient permissions");
      }

      await updateDoc(doc(db, "users", userId), {
        role,
        updatedAt: serverTimestamp(),
        updatedBy: adminUserId,
      });

      return true;
    } catch (error) {
      console.error("Error setting user role:", error);
      throw error;
    }
  }

  /**
   * Ban user (server-side, affects everyone)
   */
  static async banUser(userId, bannedBy, reason, duration = null) {
    try {
      const banData = {
        userId,
        bannedBy,
        reason,
        duration, // null for permanent ban
        isActive: true,
        createdAt: serverTimestamp(),
      };

      if (duration) {
        banData.expiresAt = new Date(Date.now() + duration);
      }

      await setDoc(doc(db, "bans", userId), banData);
      return true;
    } catch (error) {
      console.error("Error banning user:", error);
      throw error;
    }
  }

  /**
   * Check if user is banned
   */
  static async isUserBanned(userId) {
    try {
      const banDoc = await getDoc(doc(db, "bans", userId));

      if (!banDoc.exists()) {
        return false;
      }

      const banData = banDoc.data();

      if (!banData.isActive) {
        return false;
      }

      // Check if ban has expired
      if (banData.expiresAt && banData.expiresAt.toDate() < new Date()) {
        // Mark ban as inactive
        await updateDoc(doc(db, "bans", userId), { isActive: false });
        return false;
      }

      return true;
    } catch (error) {
      console.error("Error checking ban status:", error);
      return false;
    }
  }

  /**
   * Delete message (moderator/admin only)
   */
  static async deleteMessage(gameId, messageId, deletedBy) {
    try {
      // Verify permissions
      const userRole = await this.getUserRole(deletedBy);
      if (
        ![this.USER_ROLES.MODERATOR, this.USER_ROLES.ADMIN].includes(userRole)
      ) {
        throw new Error("Insufficient permissions");
      }

      // Mark message as deleted instead of actually deleting
      await updateDoc(doc(db, "chats", gameId, "messages", messageId), {
        deleted: true,
        deletedBy,
        deletedAt: serverTimestamp(),
      });

      return true;
    } catch (error) {
      console.error("Error deleting message:", error);
      throw error;
    }
  }

  /**
   * Filter messages for blocked users
   */
  static async filterMessages(messages, currentUserId) {
    try {
      const blockedUsers = await this.getBlockedUsers();
      const blockedUserIds = blockedUsers.map((user) => user.userId);

      return messages.filter((message) => {
        // Don't filter own messages
        if (message.userId === currentUserId) {
          return true;
        }

        // Filter out blocked users
        if (blockedUserIds.includes(message.userId)) {
          return false;
        }

        // Filter out deleted messages
        if (message.deleted) {
          return false;
        }

        return true;
      });
    } catch (error) {
      console.error("Error filtering messages:", error);
      return messages; // Return unfiltered on error
    }
  }

  /**
   * Get profanity filter words (you can expand this)
   */
  static getProfanityWords() {
    return [
      // Add profanity words here
      "badword1",
      "badword2",
      // This is a basic implementation - consider using a proper profanity filter library
    ];
  }

  /**
   * Check if message contains profanity
   */
  static containsProfanity(text) {
    const words = this.getProfanityWords();
    const lowerText = text.toLowerCase();

    return words.some((word) => lowerText.includes(word));
  }

  /**
   * Filter profanity from message
   */
  static filterProfanity(text) {
    let filtered = text;
    const words = this.getProfanityWords();

    words.forEach((word) => {
      const regex = new RegExp(word, "gi");
      filtered = filtered.replace(regex, "*".repeat(word.length));
    });

    return filtered;
  }

  /**
   * Rate limit check (simple implementation)
   */
  static async checkRateLimit(userId, gameId) {
    try {
      const key = `rateLimit_${userId}_${gameId}`;
      const lastMessage = await AsyncStorage.getItem(key);

      if (lastMessage) {
        const timeSince = Date.now() - parseInt(lastMessage);
        const cooldown = 5000; // 5 seconds

        if (timeSince < cooldown) {
          throw new Error(
            `Please wait ${Math.ceil(
              (cooldown - timeSince) / 1000
            )} seconds before sending another message`
          );
        }
      }

      await AsyncStorage.setItem(key, Date.now().toString());
      return true;
    } catch (error) {
      console.error("Rate limit error:", error);
      throw error;
    }
  }
}

export default ModerationService;

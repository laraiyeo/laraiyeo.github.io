import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const MutedUsersContext = createContext();

export const useMutedUsers = () => {
  const context = useContext(MutedUsersContext);
  if (!context) {
    throw new Error("useMutedUsers must be used within a MutedUsersProvider");
  }
  return context;
};

const MUTED_USERS_KEY = "@muted_users";

export const MutedUsersProvider = ({ children }) => {
  const [mutedUsers, setMutedUsers] = useState(new Set());
  const [isLoading, setIsLoading] = useState(true);

  // Load muted users from AsyncStorage on init
  useEffect(() => {
    loadMutedUsers();
  }, []);

  const loadMutedUsers = async () => {
    try {
      const stored = await AsyncStorage.getItem(MUTED_USERS_KEY);
      if (stored) {
        const mutedArray = JSON.parse(stored);
        setMutedUsers(new Set(mutedArray));
      }
    } catch (error) {
      console.error("Error loading muted users:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveMutedUsers = async (newMutedUsers) => {
    try {
      const mutedArray = Array.from(newMutedUsers);
      await AsyncStorage.setItem(MUTED_USERS_KEY, JSON.stringify(mutedArray));
    } catch (error) {
      console.error("Error saving muted users:", error);
    }
  };

  const muteUser = async (userName) => {
    if (!userName || mutedUsers.has(userName)) return;

    const newMutedUsers = new Set(mutedUsers);
    newMutedUsers.add(userName);
    setMutedUsers(newMutedUsers);
    await saveMutedUsers(newMutedUsers);

    console.log("✅ User muted:", userName);
  };

  const unmuteUser = async (userName) => {
    if (!userName || !mutedUsers.has(userName)) return;

    const newMutedUsers = new Set(mutedUsers);
    newMutedUsers.delete(userName);
    setMutedUsers(newMutedUsers);
    await saveMutedUsers(newMutedUsers);

    console.log("✅ User unmuted:", userName);
  };

  const isUserMuted = (userName) => {
    return userName ? mutedUsers.has(userName) : false;
  };

  const getMutedUsersList = () => {
    return Array.from(mutedUsers);
  };

  const clearAllMutedUsers = async () => {
    setMutedUsers(new Set());
    await saveMutedUsers(new Set());
    console.log("✅ All users unmuted");
  };

  const value = {
    mutedUsers,
    isLoading,
    muteUser,
    unmuteUser,
    isUserMuted,
    getMutedUsersList,
    clearAllMutedUsers,
  };

  return (
    <MutedUsersContext.Provider value={value}>
      {children}
    </MutedUsersContext.Provider>
  );
};

export default MutedUsersContext;

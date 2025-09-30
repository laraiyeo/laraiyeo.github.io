import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  serverTimestamp,
  limit 
} from 'firebase/firestore';
import { db } from '../config/firebase';
import ChatUtils from '../utils/ChatUtils';

const ChatContext = createContext();

// Default name colors
const DEFAULT_NAME_COLORS = [
  '#FF6B6B', // Red
  '#4ECDC4', // Teal
  '#45B7D1', // Blue
  '#96CEB4', // Green
  '#FFEAA7', // Yellow
  '#DDA0DD', // Plum
  '#98D8C8', // Mint
  '#F7DC6F', // Light Yellow
  '#BB8FCE', // Light Purple
  '#85C1E9', // Light Blue
];

export const ChatProvider = ({ children }) => {
  const [userName, setUserName] = useState('');
  const [userColor, setUserColor] = useState(DEFAULT_NAME_COLORS[0]);
  const [chatMessages, setChatMessages] = useState({});
  const [listeners, setListeners] = useState({});

  // Load saved user preferences and initialize cleanup
  useEffect(() => {
    loadUserPreferences();
    
    // Initialize automatic chat cleanup (runs every 24 hours, cleans messages older than 2 days)
    ChatUtils.scheduleCleanup(24, 2);
  }, []);

  const loadUserPreferences = async () => {
    try {
      const savedUserName = await AsyncStorage.getItem('chatUserName');
      const savedUserColor = await AsyncStorage.getItem('chatUserColor');
      
      if (savedUserName) {
        setUserName(savedUserName);
      } else {
        // Generate random username if none exists
        const randomName = `User${Math.floor(Math.random() * 10000)}`;
        setUserName(randomName);
        await AsyncStorage.setItem('chatUserName', randomName);
      }
      
      if (savedUserColor) {
        setUserColor(savedUserColor);
      } else {
        // Set random color if none exists
        const randomColor = DEFAULT_NAME_COLORS[Math.floor(Math.random() * DEFAULT_NAME_COLORS.length)];
        setUserColor(randomColor);
        await AsyncStorage.setItem('chatUserColor', randomColor);
      }
    } catch (error) {
      console.error('Error loading user preferences:', error);
    }
  };

  const updateUserName = async (newName) => {
    try {
      setUserName(newName);
      await AsyncStorage.setItem('chatUserName', newName);
    } catch (error) {
      console.error('Error saving username:', error);
    }
  };

  const updateUserColor = async (newColor) => {
    try {
      setUserColor(newColor);
      await AsyncStorage.setItem('chatUserColor', newColor);
    } catch (error) {
      console.error('Error saving user color:', error);
    }
  };

  const sendMessage = async (gameId, messageText) => {
    if (!messageText.trim() || !userName.trim()) return;

    try {
      const chatRef = collection(db, 'chats', gameId, 'messages');
      await addDoc(chatRef, {
        text: messageText.trim(),
        userName: userName.trim(),
        userColor: userColor,
        timestamp: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  };

  const subscribeToChatMessages = (gameId) => {
    // Don't create duplicate listeners
    if (listeners[gameId]) {
      return;
    }

    const chatRef = collection(db, 'chats', gameId, 'messages');
    const q = query(chatRef, orderBy('timestamp', 'desc'), limit(50));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate() || new Date(),
      }));

      // Reverse to show oldest first
      setChatMessages(prev => ({
        ...prev,
        [gameId]: messages.reverse()
      }));
    }, (error) => {
      console.error('Error listening to chat messages:', error);
    });

    setListeners(prev => ({
      ...prev,
      [gameId]: unsubscribe
    }));
  };

  const unsubscribeFromChatMessages = (gameId) => {
    if (listeners[gameId]) {
      listeners[gameId]();
      setListeners(prev => {
        const newListeners = { ...prev };
        delete newListeners[gameId];
        return newListeners;
      });
    }
  };

  const getChatMessages = (gameId) => {
    return chatMessages[gameId] || [];
  };

  const value = {
    userName,
    userColor,
    updateUserName,
    updateUserColor,
    sendMessage,
    subscribeToChatMessages,
    unsubscribeFromChatMessages,
    getChatMessages,
    nameColors: DEFAULT_NAME_COLORS,
  };

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};
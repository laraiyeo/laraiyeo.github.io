import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBAbBZyb3ENGpALGXTwErYNL2iJo5nr6A4",
  authDomain: "live-sports-tracker-chat.firebaseapp.com",
  projectId: "live-sports-tracker-chat",
  storageBucket: "live-sports-tracker-chat.firebasestorage.app",
  messagingSenderId: "228719774397",
  appId: "1:228719774397:web:66321ba2003c060fdc05d4",
  measurementId: "G-2KKX8TNQB9"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);

export default app;
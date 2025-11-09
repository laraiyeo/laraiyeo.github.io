import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBAbBZyb3ENGpALGXTwErYNL2iJo5nr6A4",
  authDomain: "live-sports-tracker-chat.firebaseapp.com",
  projectId: "live-sports-tracker-chat",
  databaseURL: "https://live-sports-tracker-chat-default-rtdb.firebaseio.com",
  storageBucket: "live-sports-tracker-chat.firebasestorage.app",
  messagingSenderId: "228719774397",
  appId: "1:228719774397:web:66321ba2003c060fdc05d4",
  measurementId: "G-2KKX8TNQB9",
};

// Initialize Firebase with error handling
let app = null;
let db = null;

try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  console.log("Firebase initialized successfully");
} catch (error) {
  console.warn("Firebase initialization failed:", error.message);
  console.warn("App will continue without Firebase features");
}

// Initialize Firestore
export { db };

export default app;

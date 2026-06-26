const { initializeApp } = require('firebase/app');
const { getFirestore } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyCApVMSMJE0iu1XIo-bPdMerZ1whxE76fA",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "tracker-fc269.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "tracker-fc269",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "tracker-fc269.firebasestorage.app",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "811282105117",
  appId: process.env.FIREBASE_APP_ID || "1:811282105117:web:6fb81d6c126409497f17f4",
  measurementId: process.env.FIREBASE_MEASUREMENT_ID || "G-XEP8SL354K"
};

console.log('🔥 Initializing Firebase connection...');
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
console.log('✅ Firebase initialized successfully.');

module.exports = { app, db };

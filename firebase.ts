import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyA-pfeJmlfwlcDCPuCJal7CQWS_rbJClW0",
  authDomain: "sb-divine-residents.firebaseapp.com",
  projectId: "sb-divine-residents",
  storageBucket: "sb-divine-residents.firebasestorage.app",
  messagingSenderId: "78489915130",
  appId: "1:78489915130:web:83f57e2c469ccf3d110343",
  measurementId: "G-TYMHGT7LC6"
};

// IMPORTANT: initialize ONE firebase app only
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

import React, { useState } from "react";
import { auth } from "./firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from "firebase/auth";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");

  const handleSubmit = async (e: any) => {
    e.preventDefault();

    try {
      if (mode === "login") {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (error: any) {
      alert(error.message);
    }
  };

  return (
    <div style={{ padding: 40 }}>
      <h2>{mode === "login" ? "Login" : "Sign Up"}</h2>

      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="email"
          onChange={(e) => setEmail(e.target.value)}
          style={{ display: "block", marginBottom: 12 }}
        />

        <input
          type="password"
          placeholder="password"
          onChange={(e) => setPassword(e.target.value)}
          style={{ display: "block", marginBottom: 12 }}
        />

        <button type="submit">
          {mode === "login" ? "Login" : "Create Account"}
        </button>
      </form>

      <p
        onClick={() =>
          setMode(mode === "login" ? "signup" : "login")
        }
        style={{ marginTop: 20, cursor: "pointer", color: "blue" }}
      >
        {mode === "login"
          ? "Don't have an account? Create one"
          : "Already have an account? Login"}
      </p>
    </div>
  );
}

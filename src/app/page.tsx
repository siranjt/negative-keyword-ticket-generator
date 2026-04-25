"use client";

import { useState, useEffect } from "react";
import Dashboard from "@/components/Dashboard";

export default function Home() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const stored = sessionStorage.getItem("nk_auth");
    if (stored === "1") setAuthed(true);
    setChecking(false);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      sessionStorage.setItem("nk_auth", "1");
      setAuthed(true);
    } else {
      setError("Incorrect password");
    }
  };

  if (checking) return null;

  if (!authed) {
    return (
      <div className="login-wrap">
        <form className="login-card" onSubmit={handleLogin}>
          <h1>Negative Keyword Alerts</h1>
          <p className="sub">Zoca Retention Risk Monitoring</p>
          <input
            type="password"
            placeholder="Enter team password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          <button type="submit" className="login-btn">
            Sign in
          </button>
          {error && <p className="error">{error}</p>}
        </form>
      </div>
    );
  }

  return <Dashboard />;
}

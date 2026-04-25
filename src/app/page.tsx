"use client";

import { useState, useEffect } from "react";
import ZocaLogo from "@/components/ZocaLogo";
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
          <div style={{ marginBottom: 20 }}>
            <ZocaLogo />
          </div>
          <h1>Negative Keyword Alerts</h1>
          <p className="sub">Retention Risk Monitoring</p>
          <input
            type="password"
            placeholder="Enter team password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          <button type="submit" className="btn-zoca-pink" style={{ width: "100%", padding: "12px", fontSize: 14, borderRadius: "var(--radius-zoca-pill)" }}>
            Sign in
          </button>
          {error && <p className="error">{error}</p>}
        </form>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Sticky Nav */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "var(--color-zoca-bg-nav)",
        backdropFilter: "saturate(140%) blur(14px)",
        borderBottom: "1px solid var(--color-zoca-border)",
        padding: "0 24px", height: 56,
        display: "flex", alignItems: "center", gap: 14,
      }}>
        <ZocaLogo />
        <div style={{ width: 1, height: 24, background: "var(--color-zoca-border-3)" }} />
        <div>
          <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: 14, letterSpacing: "0.2px" }}>
            Negative Keyword Alerts
          </div>
          <div style={{ fontSize: 10, color: "var(--color-zoca-text-muted)", fontWeight: 500 }}>
            Retention risk monitoring
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ padding: "48px 24px 32px", textAlign: "center" }}>
        <h1
          className="hero-title zoca-gradient-text"
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontWeight: 900,
            fontSize: "3.5rem",
            letterSpacing: "-0.03em",
            lineHeight: 1.1,
            marginBottom: 12,
          }}
        >
          <span className="sparkle-word">Keyword Alerts</span>
        </h1>
        <p style={{ color: "var(--color-zoca-text-muted)", fontSize: 15, maxWidth: 600, margin: "0 auto 16px" }}>
          Real-time detection of customer dissatisfaction signals from negative keyword monitoring.
          Select alerts and create Linear tickets in one click.
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: 24, fontSize: 12, color: "var(--color-zoca-text-soft)" }}>
          <span>&#10037; Last 24 hours</span>
          <span>&#10037; Live Metabase data</span>
          <span>&#10037; One-click ticket creation</span>
        </div>
      </section>

      {/* Dashboard */}
      <main style={{ flex: 1, maxWidth: 1600, margin: "0 auto", width: "100%", padding: "0 24px 80px" }}>
        <Dashboard />
      </main>

      {/* Footer */}
      <footer style={{
        textAlign: "center", padding: "32px 24px 24px",
        borderTop: "1px solid var(--color-zoca-border)",
      }}>
        <ZocaLogo />
        <p style={{ fontSize: 11, color: "var(--color-zoca-text-soft)", marginTop: 8 }}>
          Negative Keyword Alerts Dashboard &middot; Powered by Metabase + Linear
        </p>
      </footer>
    </div>
  );
}

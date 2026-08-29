"use client";

import { useState } from "react";
import Link from "next/link";

export default function FeedbackPage() {
  const [type, setType] = useState("general");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  async function submit() {
    if (message.trim().length < 5 || sending) return;
    setSending(true);
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, message, email, userAgent: navigator.userAgent }),
      });
      setSent(true);
    } catch {}
    setSending(false);
  }

  if (sent) {
    return (
      <main style={{ maxWidth: 480, margin: "0 auto", padding: "40px 20px", fontFamily: "system-ui, sans-serif", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>✓</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 8px" }}>Thank you!</h1>
        <p style={{ color: "#5A6B63", margin: "0 0 24px" }}>Your feedback has been recorded.</p>
        <Link href="/" style={{ color: "#237355", fontWeight: 600 }}>← Back to Board</Link>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: "40px 20px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>Feedback</h1>
      <p style={{ fontSize: 13, color: "#5A6B63", margin: "0 0 20px" }}>Bug report, feature request, or general feedback</p>

      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: "#5A6B63", textTransform: "uppercase" }}>Type</label>
        <select value={type} onChange={(e) => setType(e.target.value)}
          style={{ width: "100%", padding: "10px 12px", fontSize: 15, border: "1px solid #DEE1D9", borderRadius: 8, marginTop: 6, boxSizing: "border-box" }}>
          <option value="general">General Feedback</option>
          <option value="bug">Bug Report</option>
          <option value="feature">Feature Request</option>
        </select>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: "#5A6B63", textTransform: "uppercase" }}>Message *</label>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Tell us what's on your mind..."
          rows={5} style={{ width: "100%", padding: "10px 12px", fontSize: 15, border: "1px solid #DEE1D9", borderRadius: 8, marginTop: 6, boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" }} />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: "#5A6B63", textTransform: "uppercase" }}>Email (optional)</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" type="email"
          style={{ width: "100%", padding: "10px 12px", fontSize: 15, border: "1px solid #DEE1D9", borderRadius: 8, marginTop: 6, boxSizing: "border-box" }} />
      </div>

      <button onClick={submit} disabled={message.trim().length < 5 || sending}
        style={{ width: "100%", padding: 12, fontSize: 15, fontWeight: 700, border: "none", borderRadius: 8, background: message.trim().length >= 5 ? "#237355" : "#DEE1D9", color: message.trim().length >= 5 ? "#fff" : "#8A968F", cursor: message.trim().length >= 5 ? "pointer" : "default" }}>
        {sending ? "Sending..." : "Submit Feedback"}
      </button>
    </main>
  );
}

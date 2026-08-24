"use client";

import { useCallback, useEffect, useState } from "react";

type Profile = { id: string; pan: string; name: string; upi: string; demat: string };

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const UPI_RE = /^[\w.\-]{2,}@[a-zA-Z]{2,}$/;
const STORAGE_KEY = "ipobharosa.investors.v1";

function load(): Profile[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
}
function save(p: Profile[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); }

export default function InvestorsPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [pan, setPan] = useState("");
  const [name, setName] = useState("");
  const [upi, setUpi] = useState("");
  const [demat, setDemat] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => { setProfiles(load()); }, []);

  const add = useCallback(() => {
    const p = pan.trim().toUpperCase();
    if (!PAN_RE.test(p)) { setErr("PAN: ABCDE1234F"); return; }
    if (!name.trim()) { setErr("Name required"); return; }
    if (!UPI_RE.test(upi.trim())) { setErr("UPI: 9876543210@ybl"); return; }
    if (!/^\d{14,16}$/.test(demat.trim())) { setErr("Demat: 14-16 digits"); return; }
    const next = [...profiles, { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), pan: p, name: name.trim(), upi: upi.trim().toLowerCase(), demat: demat.trim() }];
    setProfiles(next); save(next); setPan(""); setName(""); setUpi(""); setDemat(""); setErr("");
  }, [pan, name, upi, demat, profiles]);

  const remove = useCallback((id: string) => {
    const next = profiles.filter((p) => p.id !== id);
    setProfiles(next); save(next);
  }, [profiles]);

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>Investor Profiles</h1>
      <p style={{ fontSize: 13, color: "#5A6B63", margin: "0 0 20px" }}>Pre-fill IPO applications. Stored on-device only.</p>

      <div style={{ background: "#fff", borderRadius: 12, padding: 16, border: "1px solid #DEE1D9", marginBottom: 16 }}>
        <input value={pan} onChange={(e) => { setPan(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10)); setErr(""); }}
          placeholder="PAN" autoCapitalize="characters" autoCorrect={false} spellCheck={false} maxLength={10}
          style={{ width: "100%", padding: "10px 12px", fontSize: 16, fontWeight: 600, letterSpacing: 1.5, border: "1px solid #DEE1D9", borderRadius: 8, marginBottom: 8, boxSizing: "border-box", fontFamily: "monospace" }} />
        <input value={name} onChange={(e) => { setName(e.target.value); setErr(""); }} placeholder="Holder name"
          style={{ width: "100%", padding: "10px 12px", fontSize: 15, border: "1px solid #DEE1D9", borderRadius: 8, marginBottom: 8, boxSizing: "border-box" }} />
        <input value={upi} onChange={(e) => { setUpi(e.target.value); setErr(""); }} placeholder="UPI ID (9876543210@ybl)" autoCapitalize="none"
          style={{ width: "100%", padding: "10px 12px", fontSize: 15, border: "1px solid #DEE1D9", borderRadius: 8, marginBottom: 8, boxSizing: "border-box" }} />
        <input value={demat} onChange={(e) => { setDemat(e.target.value.replace(/\D/g, "").slice(0, 16)); setErr(""); }} placeholder="Demat Client ID (14-16 digits)" maxLength={16}
          style={{ width: "100%", padding: "10px 12px", fontSize: 15, border: "1px solid #DEE1D9", borderRadius: 8, marginBottom: 12, boxSizing: "border-box", fontFamily: "monospace" }} />
        {err && <p style={{ color: "#A13F35", fontSize: 13, margin: "0 0 8px" }}>{err}</p>}
        <button onClick={add} style={{ width: "100%", padding: 10, fontSize: 15, fontWeight: 700, background: "#237355", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>
          Add Profile
        </button>
      </div>

      {profiles.length === 0 ? (
        <p style={{ color: "#8A968F", textAlign: "center", marginTop: 32 }}>No profiles yet</p>
      ) : (
        profiles.map((p) => (
          <div key={p.id} style={{ background: "#fff", borderRadius: 12, padding: "12px 16px", border: "1px solid #DEE1D9", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 15, fontFamily: "monospace" }}>{p.pan}</p>
              <p style={{ margin: "2px 0 0", fontSize: 13, color: "#5A6B63" }}>{p.name} · {p.upi}</p>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "#8A968F" }}>Demat: {p.demat}</p>
            </div>
            <button onClick={() => remove(p.id)} style={{ background: "none", border: "none", color: "#A13F35", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
              Remove
            </button>
          </div>
        ))
      )}
    </main>
  );
}

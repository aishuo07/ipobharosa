"use client";

import { useEffect, useState } from "react";
import { DataBackup } from "@/components/DataBackup";

type InvestorProfile = {
  id: string;
  pan: string;
  holderName: string;
  upiId: string;
  dematProvider: "CDSL" | "NSDL" | null;
  dematClientId: string;
  createdAt: string;
};

const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const UPI_PATTERN = /^[\w.\-]{2,}@[a-zA-Z]{2,}$/;
const DEMAT_PATTERNS = { CDSL: /^[0-9]{16}$/, NSDL: /^[0-9]{14}$/ };

function loadProfiles(): InvestorProfile[] {
  try {
    return JSON.parse(localStorage.getItem("ipobharosa.investor-profiles.v1") || "[]");
  } catch {
    return [];
  }
}

function saveProfiles(p: InvestorProfile[]) {
  localStorage.setItem("ipobharosa.investor-profiles.v1", JSON.stringify(p));
}

export default function InvestorsPage() {
  const [profiles, setProfiles] = useState<InvestorProfile[]>([]);
  const [holderName, setHolderName] = useState("");
  const [pan, setPan] = useState("");
  const [upiId, setUpiId] = useState("");
  const [dematProvider, setDematProvider] = useState<"CDSL" | "NSDL">("CDSL");
  const [dematClientId, setDematClientId] = useState("");
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setProfiles(loadProfiles());
    setMounted(true);
  }, []);

  function handleAdd() {
    if (!PAN_PATTERN.test(pan.trim().toUpperCase())) { setError("PAN: ABCDE1234F"); return; }
    if (!holderName.trim()) { setError("Enter holder name"); return; }
    if (!UPI_PATTERN.test(upiId.trim().toLowerCase())) { setError("UPI: 9876543210@ybl"); return; }
    if (!DEMAT_PATTERNS[dematProvider].test(dematClientId.trim())) {
      setError(`${dematProvider} client ID: ${dematProvider === "CDSL" ? "16" : "14"} digits`);
      return;
    }
    const profile: InvestorProfile = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      pan: pan.trim().toUpperCase(),
      holderName: holderName.trim(),
      upiId: upiId.trim().toLowerCase(),
      dematProvider,
      dematClientId: dematClientId.trim(),
      createdAt: new Date().toISOString(),
    };
    const next = [...profiles, profile];
    setProfiles(next);
    saveProfiles(next);
    setHolderName(""); setPan(""); setUpiId(""); setDematClientId("");
    setError("");
  }

  function handleRemove(id: string) {
    const next = profiles.filter((p) => p.id !== id);
    setProfiles(next);
    saveProfiles(next);
  }

  if (!mounted) return null;

  return (
    <main className="page-content">
      <div className="page-header">
        <h1>Investor Profiles</h1>
        <p className="board-kicker">Pre-fill IPO applications</p>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 14, color: "var(--ink-muted)", marginBottom: 16 }}>
          Profiles are stored in your browser only. Used to pre-fill IPO applications when in-app apply goes live.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <input className="input" placeholder="PAN (ABCDE1234F)" value={pan}
            onChange={(e) => { setPan(e.target.value); setError(""); }} maxLength={10} />
          <input className="input" placeholder="Holder name" value={holderName}
            onChange={(e) => { setHolderName(e.target.value); setError(""); }} />
          <input className="input" placeholder="UPI ID (9876543210@ybl)" value={upiId}
            onChange={(e) => { setUpiId(e.target.value); setError(""); }} />
          <div style={{ display: "flex", gap: 4 }}>
            <select className="input" value={dematProvider}
              onChange={(e) => setDematProvider(e.target.value as "CDSL" | "NSDL")}
              style={{ width: 100 }}>
              <option value="CDSL">CDSL</option>
              <option value="NSDL">NSDL</option>
            </select>
            <input className="input" placeholder={`${dematProvider} Client ID`} value={dematClientId}
              onChange={(e) => { setDematClientId(e.target.value); setError(""); }}
              style={{ flex: 1 }} />
          </div>
        </div>
        {error && <p style={{ color: "var(--red)", fontSize: 13, marginBottom: 8 }}>{error}</p>}
        <button className="btn" onClick={handleAdd}>Add Profile</button>
      </div>

      {profiles.length === 0 ? (
        <p style={{ color: "var(--ink-muted)", textAlign: "center", marginTop: 40 }}>No profiles saved yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {profiles.map((p) => (
            <div key={p.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <p style={{ fontWeight: 700, fontSize: 15, margin: 0 }}>{p.holderName}</p>
                <p style={{ color: "var(--ink-muted)", fontSize: 13, margin: "2px 0 0" }}>
                  {p.pan} · {p.dematProvider} {p.dematClientId} · {p.upiId}
                </p>
              </div>
              <button className="btn btn-ghost" style={{ color: "var(--red)", fontSize: 13 }}
                onClick={() => handleRemove(p.id)}>Remove</button>
            </div>
          ))}
        </div>
      )}

      <DataBackup />
    </main>
  );
}

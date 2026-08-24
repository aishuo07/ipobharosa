"use client";

import { useEffect, useState } from "react";

type PanCard = { id: string; pan: string; holderName: string };
type Result = { pan: string; company: string; status: string; shares?: string; amount?: string };

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const STORAGE_KEY = "ipobharosa.pan-cards.v1";

function loadPans(): PanCard[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
}

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  ALLOTTED: { bg: "#E8F2ED", fg: "#237355" },
  NOT_ALLOTTED: { bg: "#F6EAE8", fg: "#A13F35" },
  NOT_APPLIED: { bg: "#F6EBE3", fg: "#9A4E22" },
};

export default function AllotmentPage() {
  const [cards, setCards] = useState<PanCard[]>([]);
  const [manualPan, setManualPan] = useState("");
  const [company, setCompany] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [registrar, setRegistrar] = useState("kfin");

  useEffect(() => { setCards(loadPans()); }, []);

  async function check(pan: string) {
    if (!pan || !company) return null;
    try {
      const r = await fetch(`/api/registrar/${registrar}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ PAN: pan, company_code: company }),
      });
      const d = await r.json();
      if (d.results?.length > 0) {
        return { pan, company, status: d.results[0].status || "UNKNOWN", shares: d.results[0].shares, amount: d.results[0].amount };
      }
      return { pan, company, status: "NOT_APPLIED" };
    } catch {
      return { pan, company, status: "ERROR" };
    }
  }

  async function handleCheck() {
    setLoading(true); setResults([]);
    const pans = cards.length > 0 ? cards.map((c) => c.pan) : [manualPan.trim().toUpperCase()];
    const res = await Promise.all(pans.map(check));
    setResults(res.filter(Boolean) as Result[]);
    setLoading(false);
  }

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>Check Allotment</h1>
      <p style={{ fontSize: 13, color: "#5A6B63", margin: "0 0 20px" }}>Check your IPO allotment status</p>

      <div style={{ background: "#fff", borderRadius: 12, padding: 16, border: "1px solid #DEE1D9", marginBottom: 16 }}>
        {cards.length === 0 && (
          <div style={{ marginBottom: 12 }}>
            <input
              value={manualPan}
              onChange={(e) => setManualPan(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10))}
              placeholder="PAN NUMBER"
              autoCapitalize="characters"
              autoCorrect={false}
              spellCheck={false}
              maxLength={10}
              style={{ width: "100%", padding: "10px 12px", fontSize: 16, fontWeight: 600, letterSpacing: 1.5, border: "1px solid #DEE1D9", borderRadius: 8, boxSizing: "border-box", fontFamily: "monospace" }}
            />
          </div>
        )}

        <input
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="Company code (e.g. TNE, ABC)"
          style={{ width: "100%", padding: "10px 12px", fontSize: 15, border: "1px solid #DEE1D9", borderRadius: 8, marginBottom: 8, boxSizing: "border-box" }}
        />

        <select
          value={registrar}
          onChange={(e) => setRegistrar(e.target.value)}
          style={{ width: "100%", padding: "10px 12px", fontSize: 15, border: "1px solid #DEE1D9", borderRadius: 8, marginBottom: 12, boxSizing: "border-box", background: "#fff" }}
        >
          <option value="kfin">KFin Technologies</option>
          <option value="bigshare">Bigshare Services</option>
          <option value="maashitla">Maashitla Securities</option>
          <option value="mufg">MUFG / Link Intime</option>
          <option value="mas">MAS Services</option>
        </select>

        {cards.length > 0 && (
          <p style={{ fontSize: 13, color: "#5A6B63", margin: "0 0 8px" }}>
            Checking: {cards.map((c) => c.pan).join(", ")}
          </p>
        )}

        <button
          onClick={handleCheck}
          disabled={loading || (!manualPan && cards.length === 0) || !company}
          style={{ width: "100%", padding: 10, fontSize: 15, fontWeight: 700, background: loading ? "#8A968F" : "#237355", color: "#fff", border: "none", borderRadius: 8, cursor: loading ? "default" : "pointer" }}
        >
          {loading ? "Checking..." : "Check Allotment"}
        </button>
      </div>

      {results.map((r) => {
        const c = STATUS_COLORS[r.status] || STATUS_COLORS.NOT_APPLIED;
        return (
          <div key={r.pan + r.company} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", borderRadius: 12, padding: "12px 16px", border: "1px solid #DEE1D9", marginBottom: 8 }}>
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 15, fontFamily: "monospace" }}>{r.pan}</p>
              {r.shares && <p style={{ margin: "2px 0 0", fontSize: 13, color: "#5A6B63" }}>{r.shares} shares · ₹{r.amount}</p>}
            </div>
            <span style={{ padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, background: c.bg, color: c.fg }}>
              {r.status}
            </span>
          </div>
        );
      })}
    </main>
  );
}

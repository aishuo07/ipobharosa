"use client";

import { useCallback, useState } from "react";

type PanCard = { id: string; pan: string; holderName: string };

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const STORAGE_KEY = "ipobharosa.pan-cards.v1";

function load(): PanCard[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
}
function save(cards: PanCard[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(cards)); }

export default function PanCardsPage() {
  const [cards, setCards] = useState<PanCard[]>(() => load());
  const [pan, setPan] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const add = useCallback(() => {
    const p = pan.trim().toUpperCase();
    if (!PAN_RE.test(p)) { setErr("Format: ABCDE1234F"); return; }
    if (!name.trim()) { setErr("Name required"); return; }
    if (cards.some((c) => c.pan === p)) { setErr("Already saved"); return; }
    const next = [...cards, { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), pan: p, holderName: name.trim() }];
    setCards(next); save(next); setPan(""); setName(""); setErr(""); setOk("Added!");
    setTimeout(() => setOk(""), 2000);
  }, [pan, name, cards]);

  const remove = useCallback((id: string) => {
    const next = cards.filter((c) => c.id !== id);
    setCards(next); save(next);
  }, [cards]);

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>PAN Cards</h1>
      <p style={{ fontSize: 13, color: "#5A6B63", margin: "0 0 20px" }}>Stored on this device only. Never sent to any server.</p>

      <div style={{ background: "#fff", borderRadius: 12, padding: 16, border: "1px solid #DEE1D9", marginBottom: 16 }}>
        <input
          value={pan}
          onChange={(e) => { setPan(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10)); setErr(""); }}
          placeholder="PAN NUMBER"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          maxLength={10}
          style={{ width: "100%", padding: "10px 12px", fontSize: 16, fontWeight: 600, letterSpacing: 1.5, border: "1px solid #DEE1D9", borderRadius: 8, marginBottom: 8, boxSizing: "border-box", fontFamily: "monospace" }}
        />
        <input
          value={name}
          onChange={(e) => { setName(e.target.value); setErr(""); }}
          placeholder="Holder name"
          style={{ width: "100%", padding: "10px 12px", fontSize: 15, border: "1px solid #DEE1D9", borderRadius: 8, marginBottom: 12, boxSizing: "border-box" }}
        />
        {err && <p style={{ color: "#A13F35", fontSize: 13, margin: "0 0 8px" }}>{err}</p>}
        {ok && <p style={{ color: "#237355", fontSize: 13, margin: "0 0 8px" }}>{ok}</p>}
        <button onClick={add} style={{ width: "100%", padding: 10, fontSize: 15, fontWeight: 700, background: "#237355", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>
          Add PAN
        </button>
      </div>

      {cards.length === 0 ? (
        <p style={{ color: "#8A968F", textAlign: "center", marginTop: 32 }}>No PAN cards yet</p>
      ) : (
        cards.map((c) => (
          <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", borderRadius: 12, padding: "12px 16px", border: "1px solid #DEE1D9", marginBottom: 8 }}>
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 16, fontFamily: "monospace", letterSpacing: 1 }}>{c.pan}</p>
              <p style={{ margin: "2px 0 0", fontSize: 13, color: "#5A6B63" }}>{c.holderName}</p>
            </div>
            <button onClick={() => remove(c.id)} style={{ background: "none", border: "none", color: "#A13F35", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
              Remove
            </button>
          </div>
        ))
      )}

      <div style={{ marginTop: 32, padding: 16, background: "#F1F2EC", borderRadius: 12 }}>
        <p style={{ fontSize: 13, color: "#5A6B63", margin: "0 0 8px", fontWeight: 600 }}>Backup</p>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => {
            const blob = new Blob([JSON.stringify(cards)], { type: "application/json" });
            const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
            a.download = "ipobharosa-pans.json"; a.click();
          }} style={{ padding: "8px 16px", fontSize: 13, fontWeight: 600, background: "#fff", border: "1px solid #DEE1D9", borderRadius: 8, cursor: "pointer" }}>
            Export
          </button>
          <label style={{ padding: "8px 16px", fontSize: 13, fontWeight: 600, background: "#fff", border: "1px solid #DEE1D9", borderRadius: 8, cursor: "pointer" }}>
            Import
            <input type="file" accept=".json" style={{ display: "none" }} onChange={(e) => {
              const f = e.target.files?.[0]; if (!f) return;
              const r = new FileReader(); r.onload = () => {
                try { const d = JSON.parse(r.result as string); if (Array.isArray(d)) { setCards(d); save(d); } } catch {}
              }; r.readAsText(f);
            }} />
          </label>
        </div>
      </div>
    </main>
  );
}

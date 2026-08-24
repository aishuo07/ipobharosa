"use client";

import { useEffect, useState } from "react";
import { DataBackup } from "@/components/DataBackup";

type PanCard = {
  id: string;
  pan: string;
  holderName: string;
  createdAt: string;
};

const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

function normalizePan(v: string) {
  return v.trim().toUpperCase();
}

function loadCards(): PanCard[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem("ipobharosa.pan-cards.v1") || "[]");
  } catch {
    return [];
  }
}

function saveCards(cards: PanCard[]) {
  localStorage.setItem("ipobharosa.pan-cards.v1", JSON.stringify(cards));
}

export default function PanCardsPage() {
  const [cards, setCards] = useState<PanCard[]>([]);
  const [pan, setPan] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setCards(loadCards());
    setMounted(true);
  }, []);

  function handleAdd() {
    const normalized = normalizePan(pan);
    if (!PAN_PATTERN.test(normalized)) {
      setError("PAN format: ABCDE1234F");
      return;
    }
    if (!name.trim()) {
      setError("Enter holder name");
      return;
    }
    if (cards.some((c) => c.pan === normalized)) {
      setError("PAN already saved");
      return;
    }
    const card: PanCard = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      pan: normalized,
      holderName: name.trim(),
      createdAt: new Date().toISOString(),
    };
    const next = [...cards, card];
    setCards(next);
    saveCards(next);
    setPan("");
    setName("");
    setError("");
  }

  function handleRemove(id: string) {
    const next = cards.filter((c) => c.id !== id);
    setCards(next);
    saveCards(next);
  }

  if (!mounted) return null;

  return (
    <main className="page-content">
      <div className="page-header">
        <h1>PAN Cards</h1>
        <p className="board-kicker">Private, on-device only</p>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 14, color: "var(--ink-muted)", marginBottom: 16 }}>
          PAN cards are stored in your browser only. They are never sent to any server and are used
          only to check your own allotment status on official registrar sites.
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <input
            className="input"
            placeholder="PAN (ABCDE1234F)"
            value={pan}
            onChange={(e) => { setPan(e.target.value); setError(""); }}
            maxLength={10}
            style={{ flex: 1, minWidth: 160 }}
          />
          <input
            className="input"
            placeholder="Holder name"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(""); }}
            style={{ flex: 1, minWidth: 160 }}
          />
          <button className="btn" onClick={handleAdd}>Add</button>
        </div>
        {error && <p style={{ color: "var(--red)", fontSize: 13, marginTop: 4 }}>{error}</p>}
      </div>

      {cards.length === 0 ? (
        <p style={{ color: "var(--ink-muted)", textAlign: "center", marginTop: 40 }}>
          No PAN cards saved yet.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {cards.map((card) => (
            <div key={card.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <p style={{ fontWeight: 700, fontSize: 15, margin: 0 }}>{card.pan}</p>
                <p style={{ color: "var(--ink-muted)", fontSize: 13, margin: "2px 0 0" }}>{card.holderName}</p>
              </div>
              <button
                className="btn btn-ghost"
                style={{ color: "var(--red)", fontSize: 13 }}
                onClick={() => handleRemove(card.id)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <DataBackup />
    </main>
  );
}

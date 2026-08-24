"use client";

import { useEffect, useState } from "react";

type PanCard = { id: string; pan: string; holderName: string };
type BoardIpo = {
  id: string;
  slug: string;
  companyName: string;
  registrar: string | null;
  status: string;
  closeDate: string;
  listingDate: string;
};
type AllotmentResult = {
  pan: string;
  status: "ALLOTTED" | "NOT_ALLOTTED" | "NOT_APPLIED" | "ERROR";
  allotted?: string;
  amount?: string;
  error?: string;
};

const STATUS_STYLES: Record<string, { bg: string; fg: string; label: string }> = {
  ALLOTTED: { bg: "#E8F2ED", fg: "#237355", label: "Allotted" },
  NOT_ALLOTTED: { bg: "#F6EAE8", fg: "#A13F35", label: "Not Allotted" },
  NOT_APPLIED: { bg: "#F6EBE3", fg: "#9A4E22", label: "No Application" },
  ERROR: { bg: "#F6EAE8", fg: "#A13F35", label: "Error" },
};

function loadCards(): PanCard[] {
  try {
    return JSON.parse(localStorage.getItem("ipobharosa.pan-cards.v1") || "[]");
  } catch {
    return [];
  }
}

export default function AllotmentPage() {
  const [cards, setCards] = useState<PanCard[]>([]);
  const [ipos, setIpos] = useState<BoardIpo[]>([]);
  const [selectedIpo, setSelectedIpo] = useState<string>("");
  const [results, setResults] = useState<AllotmentResult[]>([]);
  const [checking, setChecking] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setCards(loadCards());
    fetch("/api/public/board?board=ALL")
      .then((r) => r.json())
      .then((data: BoardIpo[]) => {
        const eligible = data.filter((ipo) => ipo.status === "CLOSED" || ipo.status === "LISTED");
        setIpos(eligible);
        if (eligible[0]) setSelectedIpo(eligible[0].id);
      })
      .catch(() => {});
    setMounted(true);
  }, []);

  async function handleCheck() {
    if (!selectedIpo || cards.length === 0 || checking) return;
    setChecking(true);
    setResults([]);
    const ipo = ipos.find((i) => i.id === selectedIpo);
    if (!ipo) { setChecking(false); return; }

    const newResults: AllotmentResult[] = [];
    for (const card of cards) {
      try {
        const res = await fetch("/api/allotment/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pan: card.pan, ipoId: ipo.id, slug: ipo.slug }),
        });
        const data = await res.json();
        newResults.push({
          pan: card.pan,
          status: data.status || "ERROR",
          allotted: data.allotted,
          amount: data.amount,
          error: data.error,
        });
      } catch {
        newResults.push({ pan: card.pan, status: "ERROR", error: "Request failed" });
      }
    }
    setResults(newResults);
    setChecking(false);
  }

  if (!mounted) return null;

  return (
    <main className="page-content">
      <div className="page-header">
        <h1>Check Allotment</h1>
        <p className="board-kicker">Verify your IPO allotment status</p>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        {cards.length === 0 ? (
          <p style={{ color: "var(--ink-muted)", fontSize: 14 }}>
            No PAN cards saved.{" "}
            <a href="/pan-cards" style={{ color: "var(--green)", fontWeight: 600 }}>Add PAN cards first</a>
          </p>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "end" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-muted)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4, display: "block" }}>
                  Select IPO
                </label>
                <select
                  className="input"
                  value={selectedIpo}
                  onChange={(e) => setSelectedIpo(e.target.value)}
                  style={{ width: "100%" }}
                >
                  {ipos.map((ipo) => (
                    <option key={ipo.id} value={ipo.id}>
                      {ipo.companyName} ({ipo.status})
                    </option>
                  ))}
                </select>
              </div>
              <button className="btn" onClick={handleCheck} disabled={checking || !selectedIpo}>
                {checking ? "Checking..." : "Check Allotment"}
              </button>
            </div>
            <p style={{ fontSize: 13, color: "var(--ink-muted)" }}>
              Checking for {cards.length} PAN card(s): {cards.map((c) => c.pan).join(", ")}
            </p>
          </>
        )}
      </div>

      {results.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {results.map((r) => {
            const style = STATUS_STYLES[r.status] || STATUS_STYLES.ERROR;
            return (
              <div key={r.pan} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 15, margin: 0 }}>{r.pan}</p>
                  {r.allotted && <p style={{ fontSize: 13, color: "var(--ink-muted)", margin: "2px 0 0" }}>Shares: {r.allotted}</p>}
                  {r.amount && <p style={{ fontSize: 13, color: "var(--ink-muted)", margin: "2px 0 0" }}>Amount: ₹{r.amount}</p>}
                  {r.error && <p style={{ fontSize: 13, color: "var(--red)", margin: "2px 0 0" }}>{r.error}</p>}
                </div>
                <span style={{
                  padding: "4px 12px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 700,
                  backgroundColor: style.bg,
                  color: style.fg,
                }}>
                  {style.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

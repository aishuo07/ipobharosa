"use client";

import { useEffect, useState } from "react";

type PanCard = { id: string; pan: string };
type Ipo = { id: string; companyName: string; slug: string; registrar: string | null; status: string; closeDate: string };
type Result = { status: string; company?: string; shares?: string; amount?: string; error?: string };

const PAN_KEY = "ipobharosa.pan-cards.v1";
function loadPans(): PanCard[] {
  try { return JSON.parse(localStorage.getItem(PAN_KEY) || "[]"); } catch { return []; }
}

function registrarKey(r: string | null): string | null {
  if (!r) return null;
  const low = r.toLowerCase();
  if (low.includes("kfin")) return "kfin";
  if (low.includes("bigshare")) return "bigshare";
  if (low.includes("mufg") || low.includes("link intime") || low.includes("intime")) return "mufg";
  if (low.includes("mas")) return "mas";
  if (low.includes("maashitla")) return "maashitla";
  if (low.includes("purva")) return "purva";
  if (low.includes("cameo")) return "cameo";
  if (low.includes("skyline")) return "skyline";
  return null;
}

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  ALLOTTED: { bg: "#E8F2ED", fg: "#237355", label: "Allotted" },
  NOT_ALLOTTED: { bg: "#F6EAE8", fg: "#A13F35", label: "Not Allotted" },
  NOT_APPLIED: { bg: "#F6EBE3", fg: "#9A4E22", label: "No Application" },
  ERROR: { bg: "#F6EAE8", fg: "#A13F35", label: "Error" },
};

export default function AllotmentPage() {
  const [cards, setCards] = useState<PanCard[]>([]);
  const [manualPan, setManualPan] = useState("");
  const [ipos, setIpos] = useState<Ipo[]>([]);
  const [selectedIpo, setSelectedIpo] = useState("");
  const [results, setResults] = useState<{ pan: string; result: Result }[]>([]);
  const [checking, setChecking] = useState(false);
  const [loadingIpos, setLoadingIpos] = useState(true);

  useEffect(() => {
    setCards(loadPans());
    fetch("/api/public/board?board=ALL")
      .then((r) => r.json())
      .then((data: Ipo[]) => {
        const eligible = data
          .filter((i) => i.status === "CLOSED" || i.status === "LISTED")
          .sort((a, b) => b.closeDate.localeCompare(a.closeDate));
        setIpos(eligible);
        if (eligible[0]) setSelectedIpo(eligible[0].id);
      })
      .catch(() => {})
      .finally(() => setLoadingIpos(false));
  }, []);

  const pans = cards.length > 0 ? cards.map((c) => c.pan) : (manualPan.trim() ? [manualPan.trim().toUpperCase()] : []);
  const ipo = ipos.find((i) => i.id === selectedIpo);
  const regKey = registrarKey(ipo?.registrar ?? null);

  async function doCheck() {
    if (pans.length === 0 || !ipo || !regKey || checking) return;
    setChecking(true);
    setResults([]);
    const out: { pan: string; result: Result }[] = [];
    for (const pan of pans) {
      try {
        const r = await fetch(`/api/registrar/${regKey}/search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ PAN: pan, company_name: ipo.companyName }),
        });
        const d = await r.json();
        if (d.ok && d.results?.length > 0) {
          const hit = d.results[0];
          out.push({ pan, result: { status: hit.status || "UNKNOWN", company: hit.company_name || hit.COMPANY_NAME, shares: hit.allotted_shares || hit.shares || hit.ALLOTTED_SHARES, amount: hit.amount || hit.ALLOTMENT_AMT } });
        } else {
          out.push({ pan, result: { status: "ERROR", error: d.error || "Not found" } });
        }
      } catch {
        out.push({ pan, result: { status: "ERROR", error: "Network error" } });
      }
    }
    setResults(out);
    setChecking(false);
  }

  const canCheck = pans.length > 0 && !!ipo && !!regKey && !checking;

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>Check Allotment</h1>
      <p style={{ fontSize: 13, color: "#5A6B63", margin: "0 0 20px" }}>Select IPO, enter PAN — done</p>

      <div style={{ background: "#fff", borderRadius: 12, padding: 16, border: "1px solid #DEE1D9", marginBottom: 12 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: "#5A6B63", textTransform: "uppercase", letterSpacing: 0.5 }}>Select IPO</label>
        {loadingIpos ? <p style={{ fontSize: 14, color: "#8A968F", marginTop: 8 }}>Loading...</p> : (
          <select value={selectedIpo} onChange={(e) => { setSelectedIpo(e.target.value); setResults([]); }}
            style={{ width: "100%", padding: "10px 12px", fontSize: 15, border: "1px solid #DEE1D9", borderRadius: 8, marginTop: 6, boxSizing: "border-box", background: "#fff" }}>
            {ipos.map((i) => <option key={i.id} value={i.id}>{i.companyName}</option>)}
          </select>
        )}
        {ipo && <p style={{ fontSize: 12, color: "#8A968F", margin: "6px 0 0" }}>Registrar: <b>{ipo.registrar || "Unknown"}</b>{!regKey && <span style={{ color: "#A13F35" }}> (not supported)</span>}</p>}
      </div>

      <div style={{ background: "#fff", borderRadius: 12, padding: 16, border: "1px solid #DEE1D9", marginBottom: 12 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: "#5A6B63", textTransform: "uppercase", letterSpacing: 0.5 }}>PAN</label>
        {cards.length > 0 ? (
          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {cards.map((c) => <span key={c.id} style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 700, background: "#E8F2ED", color: "#237355", padding: "4px 10px", borderRadius: 6 }}>{c.pan}</span>)}
          </div>
        ) : (
          <input value={manualPan} onChange={(e) => setManualPan(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10))}
            placeholder="ABCDE1234F" autoCapitalize="characters" autoCorrect="off" spellCheck={false} maxLength={10}
            style={{ width: "100%", padding: "10px 12px", fontSize: 16, fontWeight: 600, letterSpacing: 1.5, border: "1px solid #DEE1D9", borderRadius: 8, marginTop: 6, boxSizing: "border-box", fontFamily: "monospace" }} />
        )}
      </div>

      <button onClick={doCheck} disabled={!canCheck}
        style={{ width: "100%", padding: 12, fontSize: 15, fontWeight: 700, border: "none", borderRadius: 8, background: canCheck ? "#237355" : "#DEE1D9", color: canCheck ? "#fff" : "#8A968F", cursor: canCheck ? "pointer" : "default" }}>
        {checking ? "Checking..." : "Check Allotment"}
      </button>

      {results.length > 0 && (
        <div style={{ marginTop: 16 }}>
          {results.map(({ pan, result }) => {
            const s = STATUS_STYLE[result.status] || STATUS_STYLE.ERROR;
            return (
              <div key={pan} style={{ background: "#fff", borderRadius: 12, padding: "14px 16px", border: "1px solid #DEE1D9", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <p style={{ margin: 0, fontFamily: "monospace", fontWeight: 700, fontSize: 15 }}>{pan}</p>
                  {result.company && <p style={{ margin: "2px 0 0", fontSize: 13, color: "#5A6B63" }}>{result.company}</p>}
                  {result.shares && <p style={{ margin: "2px 0 0", fontSize: 13, color: "#237355", fontWeight: 600 }}>{result.shares} shares · ₹{result.amount}</p>}
                  {result.error && <p style={{ margin: "2px 0 0", fontSize: 12, color: "#A13F35" }}>{result.error}</p>}
                </div>
                <span style={{ flexShrink: 0, padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, background: s.bg, color: s.fg }}>{s.label}</span>
              </div>
            );
          })}
        </div>
      )}

      {cards.length === 0 && <div style={{ marginTop: 20, padding: 12, background: "#F1F2EC", borderRadius: 8 }}><p style={{ fontSize: 13, color: "#5A6B63", margin: 0 }}>Save PAN at <a href="/pan-cards" style={{ color: "#237355", fontWeight: 600 }}>PAN Cards</a> — no typing every time.</p></div>}
    </main>
  );
}

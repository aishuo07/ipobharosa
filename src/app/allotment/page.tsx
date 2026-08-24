"use client";

import { useEffect, useState } from "react";

type PanCard = { id: string; pan: string };
type Ipo = { id: string; companyName: string; slug: string; registrar: string | null; status: string; closeDate: string };
type Result = { pan: string; status: string; company?: string; shares?: string; amount?: string; error?: string };

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const PAN_KEY = "ipobharosa.pan-cards.v1";
function loadPans(): PanCard[] {
  try { return JSON.parse(localStorage.getItem(PAN_KEY) || "[]"); } catch { return []; }
}

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  ALLOTTED: { bg: "#E8F2ED", fg: "#237355", label: "Allotted" },
  NOT_ALLOTTED: { bg: "#F6EAE8", fg: "#A13F35", label: "Not Allotted" },
  NOT_APPLIED: { bg: "#F6EBE3", fg: "#9A4E22", label: "No Application" },
  ERROR: { bg: "#F6EAE8", fg: "#A13F35", label: "Error" },
  CHECKING: { bg: "#EAEEF7", fg: "#3B5BA5", label: "Checking..." },
};

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

export default function AllotmentPage() {
  const [cards, setCards] = useState<PanCard[]>([]);
  const [manualPan, setManualPan] = useState("");
  const [ipos, setIpos] = useState<Ipo[]>([]);
  const [selectedIpo, setSelectedIpo] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [checking, setChecking] = useState(false);
  const [loadingIpos, setLoadingIpos] = useState(true);

  useEffect(() => {
    setCards(loadPans());
    // Fetch only closed/listed IPOs — lightweight
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
    setResults(pans.map((p) => ({ pan: p, status: "CHECKING" })));

    const out: Result[] = [];
    for (const pan of pans) {
      try {
        const r = await fetch(`/api/registrar/${regKey}/search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ PAN: pan, company_code: ipo.slug.toUpperCase() }),
        });
        const d = await r.json();
        if (d.ok && d.results?.length > 0) {
          const hit = d.results[0];
          out.push({ pan, status: hit.status || "UNKNOWN", company: hit.company_name || ipo.companyName, shares: hit.allotted_shares || hit.shares, amount: hit.amount });
        } else if (d.requires_captcha) {
          out.push({ pan, status: "ERROR", error: "CAPTCHA required — open registrar site directly" });
        } else {
          out.push({ pan, status: "NOT_APPLIED" });
        }
      } catch {
        out.push({ pan, status: "ERROR", error: "Network error" });
      }
    }
    setResults(out);
    setChecking(false);
  }

  const canCheck = pans.length > 0 && !!ipo && !!regKey && !checking;

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>Check Allotment</h1>
      <p style={{ fontSize: 13, color: "#5A6B63", margin: "0 0 20px" }}>Select IPO, enter PAN — we handle the rest</p>

      {/* IPO Selector */}
      <div style={{ background: "#fff", borderRadius: 12, padding: 16, border: "1px solid #DEE1D9", marginBottom: 12 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: "#5A6B63", textTransform: "uppercase", letterSpacing: 0.5 }}>Select IPO</label>
        {loadingIpos ? (
          <p style={{ fontSize: 14, color: "#8A968F", marginTop: 8 }}>Loading IPOs...</p>
        ) : (
          <select
            value={selectedIpo}
            onChange={(e) => { setSelectedIpo(e.target.value); setResults([]); }}
            style={{ width: "100%", padding: "10px 12px", fontSize: 15, border: "1px solid #DEE1D9", borderRadius: 8, marginTop: 6, boxSizing: "border-box", background: "#fff" }}
          >
            {ipos.map((i) => (
              <option key={i.id} value={i.id}>{i.companyName} ({i.status})</option>
            ))}
          </select>
        )}
        {ipo && (
          <p style={{ fontSize: 12, color: "#8A968F", margin: "6px 0 0" }}>
            Registrar: {ipo.registrar || "Unknown"}
            {!regKey && <span style={{ color: "#A13F35" }}> (not supported for auto-check)</span>}
          </p>
        )}
      </div>

      {/* PAN Input */}
      <div style={{ background: "#fff", borderRadius: 12, padding: 16, border: "1px solid #DEE1D9", marginBottom: 12 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: "#5A6B63", textTransform: "uppercase", letterSpacing: 0.5 }}>PAN</label>
        {cards.length > 0 ? (
          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {cards.map((c) => (
              <span key={c.id} style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 700, background: "#E8F2ED", color: "#237355", padding: "4px 10px", borderRadius: 6 }}>
                {c.pan}
              </span>
            ))}
          </div>
        ) : (
          <input
            value={manualPan}
            onChange={(e) => setManualPan(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10))}
            placeholder="ABCDE1234F"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={10}
            style={{ width: "100%", padding: "10px 12px", fontSize: 16, fontWeight: 600, letterSpacing: 1.5, border: "1px solid #DEE1D9", borderRadius: 8, marginTop: 6, boxSizing: "border-box", fontFamily: "monospace" }}
          />
        )}
      </div>

      {/* Check Button */}
      <button
        onClick={doCheck}
        disabled={!canCheck}
        style={{
          width: "100%", padding: 12, fontSize: 15, fontWeight: 700, border: "none", borderRadius: 8,
          background: canCheck ? "#237355" : "#DEE1D9",
          color: canCheck ? "#fff" : "#8A968F",
          cursor: canCheck ? "pointer" : "default",
        }}
      >
        {checking ? "Checking..." : `Check Allotment`}
      </button>

      {/* Results */}
      {results.length > 0 && (
        <div style={{ marginTop: 16 }}>
          {results.map((r) => {
            const s = STATUS_STYLE[r.status] || STATUS_STYLE.ERROR;
            return (
              <div key={r.pan} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", borderRadius: 12, padding: "12px 16px", border: "1px solid #DEE1D9", marginBottom: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 15, fontFamily: "monospace" }}>{r.pan}</p>
                  {r.company && <p style={{ margin: "2px 0 0", fontSize: 13, color: "#5A6B63" }}>{r.company}</p>}
                  {r.shares && <p style={{ margin: "2px 0 0", fontSize: 13, color: "#237355", fontWeight: 600 }}>{r.shares} shares · ₹{r.amount}</p>}
                  {r.error && <p style={{ margin: "2px 0 0", fontSize: 12, color: "#A13F35" }}>{r.error}</p>}
                </div>
                <span style={{ flexShrink: 0, padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, background: s.bg, color: s.fg }}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Save PAN prompt */}
      {cards.length === 0 && (
        <div style={{ marginTop: 24, padding: 12, background: "#F1F2EC", borderRadius: 8 }}>
          <p style={{ fontSize: 13, color: "#5A6B63", margin: 0 }}>
            Save your PAN once at <a href="/pan-cards" style={{ color: "#237355", fontWeight: 600 }}>PAN Cards</a> — no need to type every time.
          </p>
        </div>
      )}
    </main>
  );
}

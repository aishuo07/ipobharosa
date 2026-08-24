"use client";

import { useEffect, useState } from "react";

type PanCard = { id: string; pan: string };
type Result = { pan: string; status: string; company?: string; shares?: string; amount?: string; error?: string };

const STORAGE_KEY = "ipobharosa.pan-cards.v1";
function loadPans(): PanCard[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
}

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  ALLOTTED: { bg: "#E8F2ED", fg: "#237355", label: "Allotted" },
  NOT_ALLOTTED: { bg: "#F6EAE8", fg: "#A13F35", label: "Not Allotted" },
  NOT_APPLIED: { bg: "#F6EBE3", fg: "#9A4E22", label: "No Application" },
  ERROR: { bg: "#F6EAE8", fg: "#A13F35", label: "Error" },
  CHECKING: { bg: "#EAEEF7", fg: "#3B5BA5", label: "Checking..." },
};

const REGISTRARS = [
  { key: "kfin", name: "KFin" },
  { key: "bigshare", name: "Bigshare" },
  { key: "mufg", name: "MUFG / Link Intime" },
  { key: "mas", name: "MAS Services" },
  { key: "maashitla", name: "Maashitla" },
  { key: "purva", name: "Purva Sharegistry" },
];

export default function AllotmentPage() {
  const [cards, setCards] = useState<PanCard[]>([]);
  const [manualPan, setManualPan] = useState("");
  const [companyCode, setCompanyCode] = useState("");
  const [registrar, setRegistrar] = useState("kfin");
  const [results, setResults] = useState<Result[]>([]);
  const [checking, setChecking] = useState(false);

  useEffect(() => { setCards(loadPans()); }, []);

  const pans = cards.length > 0 ? cards.map((c) => c.pan) : (manualPan.trim() ? [manualPan.trim().toUpperCase()] : []);

  async function doCheck() {
    if (pans.length === 0 || !companyCode.trim() || checking) return;
    setChecking(true);
    setResults(pans.map((p) => ({ pan: p, status: "CHECKING" })));

    const code = companyCode.trim().toUpperCase();
    const out: Result[] = [];

    for (const pan of pans) {
      try {
        const r = await fetch(`/api/registrar/${registrar}/search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ PAN: pan, company_code: code }),
        });
        const d = await r.json();
        if (d.ok && d.results?.length > 0) {
          const hit = d.results[0];
          out.push({ pan, status: hit.status || "UNKNOWN", company: hit.company_name, shares: hit.allotted_shares || hit.shares, amount: hit.amount });
        } else if (d.requires_captcha) {
          out.push({ pan, status: "ERROR", error: "CAPTCHA required — try registrar site directly" });
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

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>Allotment Check</h1>
      <p style={{ fontSize: 13, color: "#5A6B63", margin: "0 0 20px" }}>Check your IPO allotment from registrar records</p>

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
            autoCorrect={false}
            spellCheck={false}
            maxLength={10}
            style={{ width: "100%", padding: "10px 12px", fontSize: 16, fontWeight: 600, letterSpacing: 1.5, border: "1px solid #DEE1D9", borderRadius: 8, marginTop: 6, boxSizing: "border-box", fontFamily: "monospace" }}
          />
        )}
      </div>

      {/* Company + Registrar */}
      <div style={{ background: "#fff", borderRadius: 12, padding: 16, border: "1px solid #DEE1D9", marginBottom: 12 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: "#5A6B63", textTransform: "uppercase", letterSpacing: 0.5 }}>Company Code</label>
        <input
          value={companyCode}
          onChange={(e) => setCompanyCode(e.target.value.toUpperCase().replace(/[^A-Z0-9 ]/g, ""))}
          placeholder="e.g. TNE, NESS, HDB"
          autoCapitalize="characters"
          style={{ width: "100%", padding: "10px 12px", fontSize: 15, border: "1px solid #DEE1D9", borderRadius: 8, marginTop: 6, boxSizing: "border-box" }}
        />
        <p style={{ fontSize: 12, color: "#8A968F", margin: "4px 0 0" }}>Short code from IPO form — check your application</p>

        <label style={{ fontSize: 12, fontWeight: 700, color: "#5A6B63", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 12, display: "block" }}>Registrar</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
          {REGISTRARS.map((r) => (
            <button
              key={r.key}
              onClick={() => setRegistrar(r.key)}
              style={{
                padding: "6px 12px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "1px solid",
                borderColor: registrar === r.key ? "#237355" : "#DEE1D9",
                background: registrar === r.key ? "#E8F2ED" : "#fff",
                color: registrar === r.key ? "#237355" : "#5A6B63",
                cursor: "pointer",
              }}
            >
              {r.name}
            </button>
          ))}
        </div>
      </div>

      {/* Check Button */}
      <button
        onClick={doCheck}
        disabled={checking || pans.length === 0 || !companyCode.trim()}
        style={{
          width: "100%", padding: 12, fontSize: 15, fontWeight: 700, border: "none", borderRadius: 8,
          background: checking || pans.length === 0 || !companyCode.trim() ? "#DEE1D9" : "#237355",
          color: checking || pans.length === 0 || !companyCode.trim() ? "#8A968F" : "#fff",
          cursor: checking ? "default" : "pointer",
        }}
      >
        {checking ? "Checking..." : `Check ${pans.length > 1 ? pans.length + " PANs" : "Allotment"}`}
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
                  {r.shares && <p style={{ margin: "2px 0 0", fontSize: 13, color: "#5A6B63" }}>{r.shares} shares · ₹{r.amount}</p>}
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

      {/* Info */}
      <div style={{ marginTop: 24, padding: 12, background: "#F1F2EC", borderRadius: 8, fontSize: 13, color: "#5A6B63", lineHeight: 1.5 }}>
        <b>How it works:</b> IPOBharosa checks the registrar website for your PAN. Company code is the short code on your IPO application form (e.g. TNE for Takyon Networks). Select the registrar that handled your IPO.
      </div>
    </main>
  );
}

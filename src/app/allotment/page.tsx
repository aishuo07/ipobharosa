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

const REGISTRAR_NAMES: Record<string, string> = {
  kfin: "KFin Technologies",
  bigshare: "Bigshare Services",
  mufg: "MUFG / Link Intime",
  mas: "MAS Services",
  maashitla: "Maashitla Securities",
  purva: "Purva Sharegistry",
  cameo: "Cameo Corporate",
  skyline: "Skyline Financial",
};

// Registrars with broken APIs — show portal link as fallback
const PORTAL_URLS: Record<string, string> = {
  kfin: "https://ipostatus.kfintech.com/",
  bigshare: "https://ipo.bigshareonline.com/ipo_status.html",
  cameo: "https://ipostatus.cameoindia.com",
  skyline: "https://www.skylinerta.com/ipo.php",
  purva: "https://www.purvashare.com/investor-service/ipo-query",
};

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  ALLOTTED: { bg: "#E8F2ED", fg: "#237355", label: "Allotted" },
  NOT_ALLOTTED: { bg: "#F6EAE8", fg: "#A13F35", label: "Not Allotted" },
  NOT_APPLIED: { bg: "#F6EBE3", fg: "#9A4E22", label: "No Application" },
  ERROR: { bg: "#F6EAE8", fg: "#A13F35", label: "Error" },
};

export default function AllotmentPage() {
  const [cards] = useState<PanCard[]>(() => loadPans());
  const [manualPan, setManualPan] = useState("");
  const [ipos, setIpos] = useState<Ipo[]>([]);
  const [selectedIpo, setSelectedIpo] = useState("");
  const [results, setResults] = useState<{ pan: string; result: Result }[]>([]);
  const [checking, setChecking] = useState(false);
  const [loadingIpos, setLoadingIpos] = useState(true);

  useEffect(() => {
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
  const isCaptchaBound = regKey ? !!PORTAL_URLS[regKey] : false;

  async function doCheck() {
    if (pans.length === 0 || !ipo || !regKey || checking) return;
    setChecking(true);
    setResults([]);

    // CAPTCHA-bound registrars — can't automate
    if (isCaptchaBound) {
      setResults(pans.map((pan) => ({
        pan,
        result: { status: "ERROR", error: `Open ${REGISTRAR_NAMES[regKey]} portal to check manually` },
      })));
      setChecking(false);
      return;
    }

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
          out.push({ pan, result: { status: "ERROR", error: d.error || "Not found in registrar records" } });
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
      <p style={{ fontSize: 13, color: "#5A6B63", margin: "0 0 20px" }}>Select IPO, enter PAN — we auto-detect registrar</p>

      {/* IPO Selector */}
      <div style={{ background: "#fff", borderRadius: 12, padding: 16, border: "1px solid #DEE1D9", marginBottom: 12 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: "#5A6B63", textTransform: "uppercase", letterSpacing: 0.5 }}>Select IPO</label>
        {loadingIpos ? <p style={{ fontSize: 14, color: "#8A968F", marginTop: 8 }}>Loading IPOs...</p> : (
          <select value={selectedIpo} onChange={(e) => { setSelectedIpo(e.target.value); setResults([]); }}
            style={{ width: "100%", padding: "10px 12px", fontSize: 15, border: "1px solid #DEE1D9", borderRadius: 8, marginTop: 6, boxSizing: "border-box", background: "#fff" }}>
            {ipos.map((i) => <option key={i.id} value={i.id}>{i.companyName}</option>)}
          </select>
        )}
        {ipo && (
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, color: "#5A6B63" }}>Registrar:</span>
            {regKey ? (
              <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 12, fontWeight: 700, background: isCaptchaBound ? "#F6EBE3" : "#E8F2ED", color: isCaptchaBound ? "#9A4E22" : "#237355" }}>
                {REGISTRAR_NAMES[regKey]}
                {isCaptchaBound ? " (CAPTCHA)" : " (Auto)"}
              </span>
            ) : (
              <span style={{ fontSize: 12, color: "#A13F35" }}>{ipo.registrar || "Unknown"} (not supported)</span>
            )}
          </div>
        )}
      </div>

      {/* CAPTCHA Warning */}
      {isCaptchaBound && (
        <div style={{ background: "#F6EBE3", borderRadius: 12, padding: 14, border: "1px solid #F6EBE3", marginBottom: 12 }}>
          <p style={{ fontSize: 13, color: "#9A4E22", margin: 0, lineHeight: 1.5 }}>
            <b>{REGISTRAR_NAMES[regKey!]}</b> requires CAPTCHA verification. Open their portal to check:
          </p>
          <a href={PORTAL_URLS[regKey!]} target="_blank" rel="noopener noreferrer"
            style={{ display: "inline-block", marginTop: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, background: "#9A4E22", color: "#fff", borderRadius: 8, textDecoration: "none" }}>
            Open {REGISTRAR_NAMES[regKey!]} Portal
          </a>
        </div>
      )}

      {/* PAN Input */}
      <div style={{ background: "#fff", borderRadius: 12, padding: 16, border: "1px solid #DEE1D9", marginBottom: 12 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: "#5A6B63", textTransform: "uppercase", letterSpacing: 0.5 }}>PAN</label>
        {cards.length > 0 ? (
          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {cards.map((c) => <span key={c.id} style={{ fontSize: 14, fontWeight: 700, background: "#E8F2ED", color: "#237355", padding: "4px 10px", borderRadius: 6 }}>{c.pan}</span>)}
          </div>
        ) : (
          <input value={manualPan} onChange={(e) => setManualPan(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10))}
            placeholder="ABCDE1234F" autoCapitalize="characters" autoCorrect="off" spellCheck={false} maxLength={10}
            style={{ width: "100%", padding: "10px 12px", fontSize: 15, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", border: "1px solid #DEE1D9", borderRadius: 8, marginTop: 6, boxSizing: "border-box" }} />
        )}
      </div>

      {/* Check Button */}
      <button onClick={doCheck} disabled={!canCheck}
        style={{ width: "100%", padding: 12, fontSize: 15, fontWeight: 700, border: "none", borderRadius: 8, background: canCheck ? "#237355" : "#DEE1D9", color: canCheck ? "#fff" : "#8A968F", cursor: canCheck ? "pointer" : "default" }}>
        {checking ? "Checking..." : isCaptchaBound ? "Open Registrar Portal" : "Check Allotment"}
      </button>

      {/* Results */}
      {results.length > 0 && (
        <div style={{ marginTop: 16 }}>
          {results.map(({ pan, result }) => {
            const s = STATUS_STYLE[result.status] || STATUS_STYLE.ERROR;
            return (
              <div key={pan} style={{ background: "#fff", borderRadius: 12, padding: "14px 16px", border: "1px solid #DEE1D9", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 15, textTransform: "uppercase" }}>{pan}</p>
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

      {/* Supported Registrars */}
      <div style={{ marginTop: 24, padding: 12, background: "#F1F2EC", borderRadius: 8 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: "#5A6B63", margin: "0 0 8px" }}>Supported Registrars</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {Object.entries(REGISTRAR_NAMES).map(([key, name]) => (
            <span key={key} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: PORTAL_URLS[key] ? "#F6EBE3" : "#E8F2ED", color: PORTAL_URLS[key] ? "#9A4E22" : "#237355" }}>
              {name} {PORTAL_URLS[key] ? "🔐" : "✅"}
            </span>
          ))}
        </div>
      </div>

      {cards.length === 0 && <div style={{ marginTop: 16, padding: 12, background: "#F1F2EC", borderRadius: 8 }}><p style={{ fontSize: 13, color: "#5A6B63", margin: 0 }}>Save PAN at <a href="/pan-cards" style={{ color: "#237355", fontWeight: 600 }}>PAN Cards</a> — no typing every time.</p></div>}
    </main>
  );
}

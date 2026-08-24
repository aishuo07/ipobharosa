"use client";

import { useEffect, useState } from "react";

type PanCard = { id: string; pan: string };
type Ipo = { id: string; companyName: string; slug: string; registrar: string | null; status: string; closeDate: string };
type RegistrarResult = { registrar: string; status: string; company?: string; shares?: string; amount?: string; error?: string };
type Result = { pan: string; registrars: RegistrarResult[] };

const PAN_KEY = "ipobharosa.pan-cards.v1";
function loadPans(): PanCard[] {
  try { return JSON.parse(localStorage.getItem(PAN_KEY) || "[]"); } catch { return []; }
}

const REGISTRARS = [
  { key: "kfin", name: "KFin" },
  { key: "mas", name: "MAS" },
  { key: "bigshare", name: "Bigshare" },
  { key: "mufg", name: "MUFG" },
  { key: "maashitla", name: "Maashitla" },
  { key: "purva", name: "Purva" },
];

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  ALLOTTED: { bg: "#E8F2ED", fg: "#237355" },
  NOT_ALLOTTED: { bg: "#F6EAE8", fg: "#A13F35" },
  NOT_APPLIED: { bg: "#F6EBE3", fg: "#9A4E22" },
  ERROR: { bg: "#F6EAE8", fg: "#A13F35" },
  CHECKING: { bg: "#EAEEF7", fg: "#3B5BA5" },
};

export default function AllotmentPage() {
  const [cards, setCards] = useState<PanCard[]>([]);
  const [manualPan, setManualPan] = useState("");
  const [ipos, setIpos] = useState<Ipo[]>([]);
  const [selectedIpo, setSelectedIpo] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [checking, setChecking] = useState(false);
  const [loadingIpos, setLoadingIpos] = useState(true);
  const [checkMode, setCheckMode] = useState<"all" | "specific">("all");
  const [selectedRegistrar, setSelectedRegistrar] = useState("kfin");

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

  async function checkRegistrar(pan: string, regKey: string): Promise<RegistrarResult> {
    try {
      const r = await fetch(`/api/registrar/${regKey}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ PAN: pan, company_code: ipo?.slug?.toUpperCase() || "" }),
      });
      const d = await r.json();
      if (d.ok && d.results?.length > 0) {
        const hit = d.results[0];
        return { registrar: regKey, status: hit.status || "UNKNOWN", company: hit.company_name, shares: hit.allotted_shares || hit.shares, amount: hit.amount };
      }
      if (d.requires_captcha) {
        return { registrar: regKey, status: "ERROR", error: "CAPTCHA required" };
      }
      if (d.error) {
        return { registrar: regKey, status: "ERROR", error: d.error };
      }
      return { registrar: regKey, status: "NOT_APPLIED" };
    } catch {
      return { registrar: regKey, status: "ERROR", error: "Network error" };
    }
  }

  async function doCheck() {
    if (pans.length === 0 || !ipo || checking) return;
    setChecking(true);
    setResults(pans.map((p) => ({ pan: p, registrars: [] })));

    const regsToCheck = checkMode === "all"
      ? REGISTRARS.map((r) => r.key)
      : [selectedRegistrar];

    for (const pan of pans) {
      const regResults = await Promise.all(regsToCheck.map((r) => checkRegistrar(pan, r)));
      setResults((prev) => prev.map((r) => r.pan === pan ? { ...r, registrars: regResults } : r));
    }
    setChecking(false);
  }

  const canCheck = pans.length > 0 && !!ipo && !checking;

  return (
    <main style={{ maxWidth: 520, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>Check Allotment</h1>
      <p style={{ fontSize: 13, color: "#5A6B63", margin: "0 0 20px" }}>Select IPO, enter PAN — we check all registrars</p>

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
        {ipo && <p style={{ fontSize: 12, color: "#8A968F", margin: "6px 0 0" }}>Registrar on file: {ipo.registrar || "Unknown"}</p>}
      </div>

      {/* Check Mode */}
      <div style={{ background: "#fff", borderRadius: 12, padding: 16, border: "1px solid #DEE1D9", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setCheckMode("all")}
            style={{ flex: 1, padding: 8, fontSize: 13, fontWeight: 700, borderRadius: 8, border: "1px solid", borderColor: checkMode === "all" ? "#237355" : "#DEE1D9", background: checkMode === "all" ? "#E8F2ED" : "#fff", color: checkMode === "all" ? "#237355" : "#5A6B63", cursor: "pointer" }}
          >
            Check All Registrars
          </button>
          <button
            onClick={() => setCheckMode("specific")}
            style={{ flex: 1, padding: 8, fontSize: 13, fontWeight: 700, borderRadius: 8, border: "1px solid", borderColor: checkMode === "specific" ? "#237355" : "#DEE1D9", background: checkMode === "specific" ? "#E8F2ED" : "#fff", color: checkMode === "specific" ? "#237355" : "#5A6B63", cursor: "pointer" }}
          >
            Specific Registrar
          </button>
        </div>
        {checkMode === "specific" && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            {REGISTRARS.map((r) => (
              <button
                key={r.key}
                onClick={() => setSelectedRegistrar(r.key)}
                style={{ padding: "6px 12px", fontSize: 12, fontWeight: 600, borderRadius: 6, border: "1px solid", borderColor: selectedRegistrar === r.key ? "#237355" : "#DEE1D9", background: selectedRegistrar === r.key ? "#E8F2ED" : "#fff", color: selectedRegistrar === r.key ? "#237355" : "#5A6B63", cursor: "pointer" }}
              >
                {r.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* PAN Input */}
      <div style={{ background: "#fff", borderRadius: 12, padding: 16, border: "1px solid #DEE1D9", marginBottom: 12 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: "#5A6B63", textTransform: "uppercase", letterSpacing: 0.5 }}>PAN</label>
        {cards.length > 0 ? (
          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {cards.map((c) => (
              <span key={c.id} style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 700, background: "#E8F2ED", color: "#237355", padding: "4px 10px", borderRadius: 6 }}>{c.pan}</span>
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
        style={{ width: "100%", padding: 12, fontSize: 15, fontWeight: 700, border: "none", borderRadius: 8, background: canCheck ? "#237355" : "#DEE1D9", color: canCheck ? "#fff" : "#8A968F", cursor: canCheck ? "pointer" : "default" }}
      >
        {checking ? "Checking all registrars..." : checkMode === "all" ? "Check All Registrars" : "Check Allotment"}
      </button>

      {/* Results */}
      {results.length > 0 && (
        <div style={{ marginTop: 16 }}>
          {results.map((r) => (
            <div key={r.pan} style={{ background: "#fff", borderRadius: 12, border: "1px solid #DEE1D9", marginBottom: 12, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid #DEE1D9", background: "#F7F8F4" }}>
                <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 15 }}>{r.pan}</span>
              </div>
              {r.registrars.length === 0 && checking ? (
                <div style={{ padding: "16px", textAlign: "center", color: "#8A968F", fontSize: 13 }}>Checking...</div>
              ) : (
                r.registrars.map((reg) => {
                  const s = STATUS_STYLE[reg.status] || STATUS_STYLE.ERROR;
                  return (
                    <div key={reg.registrar} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderTop: "1px solid #F1F2EC" }}>
                      <div style={{ minWidth: 0 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#173C32" }}>{REGISTRARS.find((x) => x.key === reg.registrar)?.name || reg.registrar}</span>
                        {reg.company && <span style={{ fontSize: 12, color: "#5A6B63", marginLeft: 8 }}>{reg.company}</span>}
                        {reg.shares && <span style={{ fontSize: 12, color: "#237355", fontWeight: 600, marginLeft: 8 }}>{reg.shares} shares</span>}
                        {reg.error && <span style={{ fontSize: 11, color: "#A13F35", marginLeft: 8 }}>{reg.error}</span>}
                      </div>
                      <span style={{ flexShrink: 0, padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: s.bg, color: s.fg }}>
                        {reg.status}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          ))}
        </div>
      )}

      {cards.length === 0 && (
        <div style={{ marginTop: 24, padding: 12, background: "#F1F2EC", borderRadius: 8 }}>
          <p style={{ fontSize: 13, color: "#5A6B63", margin: 0 }}>
            Save PAN at <a href="/pan-cards" style={{ color: "#237355", fontWeight: 600 }}>PAN Cards</a> — no typing every time.
          </p>
        </div>
      )}
    </main>
  );
}

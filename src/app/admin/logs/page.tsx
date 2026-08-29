"use client";

import { useEffect, useState } from "react";

type Log = {
  id: string;
  level: string;
  message: string;
  route: string;
  details: string | null;
  createdAt: string;
};

const LEVEL_COLORS: Record<string, { bg: string; fg: string }> = {
  error: { bg: "#F6EAE8", fg: "#A13F35" },
  warn: { bg: "#F6EBE3", fg: "#9A4E22" },
  info: { bg: "#EAEEF7", fg: "#3B5BA5" },
};

function fetchLogs(route: string): Promise<Log[]> {
  const url = route ? `/api/admin/error-log?route=${encodeURIComponent(route)}` : "/api/admin/error-log";
  return fetch(url).then((r) => r.json()).then((d) => (Array.isArray(d) ? d : []));
}

export default function AdminLogsPage() {
  const [state, setState] = useState<{ logs: Log[]; loading: boolean }>({ logs: [], loading: true });
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchLogs(filter)
      .then((logs) => { if (!cancelled) setState({ logs, loading: false }); })
      .catch(() => { if (!cancelled) setState({ logs: [], loading: false }); });
    return () => { cancelled = true; };
  }, [filter]);

  function refresh() {
    setState((s) => ({ ...s, loading: true }));
    fetchLogs(filter)
      .then((logs) => setState({ logs, loading: false }))
      .catch(() => setState({ logs: [], loading: false }));
  }

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>API Error Logs</h1>
      <p style={{ fontSize: 13, color: "#5A6B63", margin: "0 0 16px" }}>Last 50 errors from registrar API calls</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by route (e.g. kfin, mas)"
          style={{ flex: 1, padding: "8px 12px", fontSize: 14, border: "1px solid #DEE1D9", borderRadius: 8 }}
        />
        <button onClick={refresh} style={{ padding: "8px 16px", fontSize: 14, fontWeight: 600, background: "#237355", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>
          Refresh
        </button>
      </div>

      {state.loading ? (
        <p style={{ color: "#8A968F", textAlign: "center", marginTop: 40 }}>Loading...</p>
      ) : state.logs.length === 0 ? (
        <p style={{ color: "#8A968F", textAlign: "center", marginTop: 40 }}>No errors found</p>
      ) : (
        state.logs.map((log) => {
          const c = LEVEL_COLORS[log.level] || LEVEL_COLORS.error;
          const isExpanded = expanded === log.id;
          return (
            <div key={log.id} style={{ background: "#fff", borderRadius: 8, border: "1px solid #DEE1D9", marginBottom: 8, overflow: "hidden" }}>
              <div
                onClick={() => setExpanded(isExpanded ? null : log.id)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", cursor: "pointer" }}
              >
                <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700, background: c.bg, color: c.fg, textTransform: "uppercase" }}>
                  {log.level}
                </span>
                <span style={{ fontSize: 12, color: "#8A968F", fontFamily: "monospace", minWidth: 140 }}>
                  {log.route}
                </span>
                <span style={{ fontSize: 13, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {log.message}
                </span>
                <span style={{ fontSize: 11, color: "#8A968F", flexShrink: 0 }}>
                  {new Date(log.createdAt).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              </div>
              {isExpanded && log.details && (
                <pre style={{ margin: 0, padding: "10px 14px", fontSize: 12, background: "#F7F8F4", borderTop: "1px solid #DEE1D9", overflow: "auto", maxHeight: 300, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                  {(() => { try { return JSON.stringify(JSON.parse(log.details), null, 2); } catch { return log.details; } })()}
                </pre>
              )}
            </div>
          );
        })
      )}
    </main>
  );
}

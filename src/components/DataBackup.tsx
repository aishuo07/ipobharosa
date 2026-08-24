"use client";

import { useRef, useState } from "react";

function loadAll() {
  const data: Record<string, string> = {};
  for (const key of ["ipobharosa.pan-cards.v1", "ipobharosa.investor-profiles.v1", "ipobharosa.allotment-cache.v1"]) {
    try {
      const val = localStorage.getItem(key);
      if (val) data[key] = val;
    } catch {}
  }
  return data;
}

function saveAll(data: Record<string, string>) {
  for (const [key, val] of Object.entries(data)) {
    localStorage.setItem(key, val);
  }
}

export function DataBackup() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");

  function handleExport() {
    const data = loadAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ipobharosa-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg("Backup downloaded!");
    setTimeout(() => setMsg(""), 3000);
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        saveAll(data);
        setMsg("Data restored! Refresh to see changes.");
        setTimeout(() => setMsg(""), 3000);
      } catch {
        setMsg("Invalid backup file");
        setTimeout(() => setMsg(""), 3000);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  return (
    <div className="card" style={{ marginTop: 24 }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 8px" }}>Backup & Restore</h3>
      <p style={{ fontSize: 13, color: "var(--ink-muted)", marginBottom: 12 }}>
        Export your PAN cards and investor profiles to a file. Import on another device to restore.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn" onClick={handleExport}>Export Backup</button>
        <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}>Import Backup</button>
        <input ref={fileRef} type="file" accept=".json" onChange={handleImport} style={{ display: "none" }} />
      </div>
      {msg && <p style={{ fontSize: 13, color: "var(--green)", marginTop: 8 }}>{msg}</p>}
    </div>
  );
}

import Link from "next/link";

export const metadata = {
  title: "IPOBharosa — Indian IPO Tracker with Verified Sources",
  description: "Track upcoming, open, and listed Indian IPOs with real-time GMP, subscription data, and allotment check. Data verified from NSE and BSE.",
  openGraph: {
    title: "IPOBharosa — Indian IPO Tracker",
    description: "Track upcoming, open, and listed Indian IPOs with real-time GMP, subscription data, and allotment check.",
    url: "https://ipobharosa.vercel.app",
    siteName: "IPOBharosa",
    type: "website",
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    title: "IPOBharosa — Indian IPO Tracker",
    description: "Track upcoming, open, and listed Indian IPOs with real-time GMP, subscription data, and allotment check.",
  },
};

export default function LandingPage() {
  return (
    <main style={{ fontFamily: "system-ui, -apple-system, sans-serif", color: "#1A2B25", minHeight: "100vh" }}>
      <section style={{ padding: "80px 20px 60px", textAlign: "center", background: "linear-gradient(180deg, #E8F2ED 0%, #fff 100%)" }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#237355", letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>Open Source</div>
          <h1 style={{ fontSize: 42, fontWeight: 900, lineHeight: 1.1, margin: "0 0 16px", letterSpacing: -1 }}>IPOBharosa</h1>
          <p style={{ fontSize: 20, color: "#5A6B63", margin: "0 0 32px", lineHeight: 1.5, maxWidth: 520, marginLeft: "auto", marginRight: "auto" }}>
            Track every Indian IPO — dates, GMP, subscription status & allotment check. Data verified from <b>NSE</b> and <b>BSE</b>.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/board" style={{ display: "inline-block", padding: "14px 32px", fontSize: 16, fontWeight: 700, background: "#237355", color: "#fff", borderRadius: 10, textDecoration: "none" }}>View IPO Board →</Link>
            <a href="https://github.com/aishuo07/ipobharosa" target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", padding: "14px 32px", fontSize: 16, fontWeight: 700, background: "#fff", color: "#237355", borderRadius: 10, textDecoration: "none", border: "1px solid #DEE1D9" }}>GitHub</a>
          </div>
        </div>
      </section>
      <section style={{ padding: "60px 20px", maxWidth: 960, margin: "0 auto" }}>
        <h2 style={{ fontSize: 28, fontWeight: 800, textAlign: "center", marginBottom: 40 }}>Why IPOBharosa?</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
          {[
            { title: "Auto-Discovered IPOs", desc: "Pipeline automatically finds new IPOs from NSE/BSE. You never miss one." },
            { title: "Verified Data", desc: "Every IPO cross-checked against NSE and BSE official sources. 10/10 fields verified." },
            { title: "Live GMP & Subscription", desc: "Real-time Grey Market Premium and subscription numbers from official exchange data." },
            { title: "Allotment Check", desc: "Check your IPO allotment status across 8 registrars with one click." },
            { title: "PAN Card Manager", desc: "Save PAN cards once. Auto-use across all allotment checks." },
            { title: "PWA + Android App", desc: "Works on any device. Install as app. Android APK available." },
            { title: "Dark Mode", desc: "Easy on the eyes. Light and dark themes." },
            { title: "100% Free & Open Source", desc: "No ads, no paywalls, no data selling. View the code on GitHub." },
          ].map((f) => (
            <div key={f.title} style={{ padding: 24, background: "#F8F9F6", borderRadius: 12, border: "1px solid #E8EDE6" }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 6px" }}>{f.title}</h3>
              <p style={{ fontSize: 14, color: "#5A6B63", margin: 0, lineHeight: 1.5 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>
      <section style={{ padding: "48px 20px", background: "#173C32", color: "#fff", textAlign: "center" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", gap: 40, justifyContent: "center", flexWrap: "wrap" }}>
          <div><div style={{ fontSize: 32, fontWeight: 900 }}>49+</div><div style={{ fontSize: 13, opacity: 0.7 }}>IPOs Tracked</div></div>
          <div><div style={{ fontSize: 32, fontWeight: 900 }}>8</div><div style={{ fontSize: 13, opacity: 0.7 }}>Registrars</div></div>
          <div><div style={{ fontSize: 32, fontWeight: 900 }}>10/10</div><div style={{ fontSize: 13, opacity: 0.7 }}>Fields Verified</div></div>
          <div><div style={{ fontSize: 32, fontWeight: 900 }}>24/7</div><div style={{ fontSize: 13, opacity: 0.7 }}>Auto-Updates</div></div>
        </div>
      </section>
      <section style={{ padding: "60px 20px", textAlign: "center" }}>
        <h2 style={{ fontSize: 28, fontWeight: 800, marginBottom: 12 }}>Start Tracking IPOs</h2>
        <p style={{ fontSize: 16, color: "#5A6B63", marginBottom: 24 }}>No signup needed. Free forever.</p>
        <Link href="/board" style={{ display: "inline-block", padding: "14px 40px", fontSize: 16, fontWeight: 700, background: "#237355", color: "#fff", borderRadius: 10, textDecoration: "none" }}>Open IPO Board →</Link>
      </section>
      <footer style={{ padding: "32px 20px", borderTop: "1px solid #DEE1D9", textAlign: "center", fontSize: 13, color: "#8A968F" }}>
        <p style={{ margin: "0 0 8px" }}>IPOBharosa — Open-source Indian IPO tracker</p>
        <p style={{ margin: 0, display: "flex", gap: 16, justifyContent: "center" }}>
          <Link href="/privacy" style={{ color: "#237355", textDecoration: "none" }}>Privacy</Link>
          <Link href="/terms" style={{ color: "#237355", textDecoration: "none" }}>Terms</Link>
          <a href="https://github.com/aishuo07/ipobharosa" target="_blank" rel="noopener noreferrer" style={{ color: "#237355", textDecoration: "none" }}>GitHub</a>
        </p>
      </footer>
    </main>
  );
}

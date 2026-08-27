export default function TermsOfService() {
  return (
    <main style={{ maxWidth: 680, margin: "0 auto", padding: "40px 20px 80px", fontFamily: "system-ui, -apple-system, sans-serif", color: "#1A2B25", lineHeight: 1.7 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Terms of Service</h1>
      <p style={{ fontSize: 13, color: "#5A6B63", marginBottom: 32 }}>Effective: 25 August 2026</p>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>1. What We Offer</h2>
        <p style={{ fontSize: 15 }}>IPOBharosa is a free, open-source tool that aggregates publicly available Indian IPO data from NSE, BSE, and registrar websites. We display dates, GMP, subscription status, and allotment information.</p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>2. Not Financial Advice</h2>
        <p style={{ fontSize: 15 }}><b>IPOBharosa does not provide financial advice.</b> All data shown is from public sources. We do not recommend buying, selling, or applying for any IPO. Always do your own research and consult a SEBI-registered financial advisor.</p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>3. Data Accuracy</h2>
        <p style={{ fontSize: 15 }}>We strive for accuracy but cannot guarantee it. IPO data comes from NSE, BSE, and registrar APIs. Delays, errors, or omissions may occur. Always verify critical information (allotment status, subscription numbers) directly with the registrar or exchange.</p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>4. Limitation of Liability</h2>
        <p style={{ fontSize: 15 }}>IPOBharosa is provided &quot;as is&quot; without warranties. We are not liable for any losses, damages, or decisions made based on the information displayed on this platform.</p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>5. Open Source</h2>
        <p style={{ fontSize: 15 }}>IPOBharosa is open-source software. You can view, audit, and contribute to the code at <a href="https://github.com/aishuo07/ipobharosa" style={{ color: "#237355" }}>github.com/aishuo07/ipobharosa</a></p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>6. Changes</h2>
        <p style={{ fontSize: 15 }}>We may update these terms. Continued use of IPOBharosa constitutes acceptance of the updated terms.</p>
      </section>
    </main>
  );
}

export default function PrivacyPolicy() {
  return (
    <main style={{ maxWidth: 680, margin: "0 auto", padding: "40px 20px 80px", fontFamily: "system-ui, -apple-system, sans-serif", color: "#1A2B25", lineHeight: 1.7 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Privacy Policy</h1>
      <p style={{ fontSize: 13, color: "#5A6B63", marginBottom: 32 }}>Effective: 25 August 2026</p>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>1. What We Collect</h2>
        <p style={{ fontSize: 15 }}>IPOBharosa collects <b>only</b> the following data:</p>
        <ul style={{ fontSize: 15, paddingLeft: 20 }}>
          <li><b>PAN numbers</b> — stored locally on your device only. Never sent to our servers.</li>
          <li><b>Usage analytics</b> — anonymous page views, feature usage (via PostHog). No personal identification.</li>
          <li><b>Error reports</b> — anonymous technical errors (via Sentry). No personal data included.</li>
        </ul>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>2. What We Don&apos;t Collect</h2>
        <ul style={{ fontSize: 15, paddingLeft: 20 }}>
          <li>We do <b>not</b> collect names, email addresses, phone numbers, or bank details.</li>
          <li>We do <b>not</b> use cookies for tracking or advertising.</li>
          <li>We do <b>not</b> sell or share any data with third parties.</li>
          <li>We do <b>not</b> store PAN numbers on our servers. All PAN data stays on your device in localStorage.</li>
        </ul>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>3. How We Use Data</h2>
        <p style={{ fontSize: 15 }}>Anonymous analytics help us understand which features are used most and fix bugs. That&apos;s it.</p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>4. Third-Party Services</h2>
        <ul style={{ fontSize: 15, paddingLeft: 20 }}>
          <li><b>Vercel</b> — hosting (no personal data beyond anonymous server logs)</li>
          <li><b>CockroachDB</b> — stores IPO data and anonymous analytics (no personal data)</li>
          <li><b>PostHog</b> — anonymous usage analytics</li>
          <li><b>Sentry</b> — anonymous error tracking</li>
          <li><b>Resend</b> — transactional emails (alerts only, no marketing)</li>
        </ul>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>5. Data Security</h2>
        <p style={{ fontSize: 15 }}>All data is transmitted over HTTPS. PAN numbers never leave your device. We use industry-standard encryption for all connections.</p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>6. Changes</h2>
        <p style={{ fontSize: 15 }}>We may update this policy. Changes will be posted on this page with a new effective date.</p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>7. Contact</h2>
        <p style={{ fontSize: 15 }}>Questions? Open an issue at <a href="https://github.com/aishuo07/ipobharosa/issues" style={{ color: "#237355" }}>github.com/aishuo07/ipobharosa</a></p>
      </section>
    </main>
  );
}

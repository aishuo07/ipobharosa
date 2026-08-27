import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Methodology — IPOBharosa",
  description: "How IPOBharosa sources and aggregates GMP, subscription, financial, and document data for Indian IPOs.",
};

export default function MethodologyPage() {
  return (
    <LegalPage title="Methodology" updated="17 Aug 2026">
      <p>
        This page explains, in plain terms, where every number on IPOBharosa comes from, how it&apos;s
        combined, and what its limits are. If a figure on the board or detail page doesn&apos;t match what
        this page describes, that&apos;s a bug — please report it.
      </p>

      <h2>Grey Market Premium (GMP)</h2>
      <p>
        GMP is unofficial, unregulated dealer-street pricing for an IPO before it lists. No exchange, no
        regulator, and no company publishes it — it exists only because independent websites and traders
        informally track it. That makes it useful as a sentiment signal and inherently unreliable as a
        number in isolation.
      </p>
      <p>
        Unofficial GMP providers are disabled by default and can be collected only after a source-specific
        usage review and explicit Production allowlist. IPO Watch and Sahi are disabled for new collection.
        When permitted providers are configured, each observation is collected separately and the displayed
        value is the <strong>median</strong> of only the sources that returned a real quote in that cycle.
        Missing coverage never becomes zero, and every displayed quote keeps its provider link and capture time.
      </p>
      <p>The label under a GMP figure describes how much the sources that <em>did</em> report agreed:</p>
      <ul>
        <li><strong>Strong source agreement</strong> — 3 or more sources reported, all within 8% of the median.</li>
        <li><strong>Mixed source agreement</strong> — 2 or more sources reported, within 20% of the median.</li>
        <li><strong>Limited source agreement</strong> — fewer sources reported, or they disagreed by more than that.</li>
      </ul>
      <div className="legal-note">
        This is a description of source agreement, not a rating of the IPO and not a prediction of listing
        performance. &quot;Limited source agreement&quot; does not mean the IPO is bad — it usually just means
        fewer trackers have picked it up yet.
      </div>

      <h2>Freshness and staleness</h2>
      <p>
        Our ingestion pipeline runs every hour. Every GMP figure shows how long ago it was captured. If a
        value is more than 2 hours old — double our own cycle length with no successful update in between —
        we mark it <strong>Stale</strong> explicitly instead of leaving you to do that math yourself.
      </p>

      <h2>Subscription numbers</h2>
      <p>
        Unlike GMP, subscription (how many times an issue has been bid for, by QIB/NII/Retail/Employee
        category) is real exchange-reported data, not informal pricing — so it isn&apos;t aggregated across
        multiple sources the way GMP is. We read the current issue-demand snapshot directly from NSE&apos;s
        official issue details. Categories not yet published remain empty rather than being shown as zero.
      </p>

      <h2>Price band, lot size, dates, registrar, lead managers</h2>
      <p>
        Core issue terms are checked against NSE&apos;s official current/historical issue catalogues and issue
        details. SEBI&apos;s public-issues catalogue supplies DRHP/RHP filing discovery. The field-level source
        link and verification state remain visible on each IPO; conflicts are held instead of silently overwritten.
      </p>

      <h2>How a new IPO gets added</h2>
      <p>
        Every hourly cycle syncs SEBI&apos;s official DRHP/RHP catalogue. A filing can appear in the public
        pipeline before final application terms exist. Existing candidates are revalidated against NSE
        official issue details before they can become verified application-ready records:
      </p>
      <ul>
        <li>
          <strong>Fails the consistency check</strong> — kept, not discarded, with the specific reason
          recorded, so a real inconsistency is visible rather than silently retried and re-failing forever.
        </li>
        <li>
          <strong>Complete and consistent with official issue evidence</strong> — published automatically
          when the safety flag is enabled. Every field comparison and publication transition is logged.
        </li>
        <li>
          <strong>Consistent, but missing the second source or the filing link</strong> — held as a draft
          until a human checks it against the real filing and adds the sector (which isn&apos;t something we
          try to guess automatically).
        </li>
      </ul>

      <h2>Financials</h2>
      <p>
        Revenue, PAT and other supported metrics are extracted from the exact official DRHP/RHP/Prospectus
        PDF with checksum, page, table, fiscal-year, scope and audit-status evidence. Complete native-text
        values can enter one atomic filing batch. OCR, ambiguity, superseded documents and conflicts remain
        in exception review. Only immutable published records appear on the Financials tab.
      </p>
      <p>
        Every verification (and every correction, if a checked figure later turns out wrong) is written to an
        audit log with who made the change, when, and why. This log isn&apos;t public yet, but it exists and
        backs every figure you see marked verified.
      </p>

      <h2>Documents (DRHP / RHP / anchor list)</h2>
      <p>
        Document links come from SEBI&apos;s public-issues catalogue and official NSE issue details. Some official
        filings may resolve to an issuer or lead-manager hosted copy; the exact host and evidence class are
        shown. We don&apos;t re-upload or modify these filings.
      </p>

      <h2>What this site doesn&apos;t do</h2>
      <ul>
        <li>We don&apos;t predict listing price, listing gains, or subscription outcomes.</li>
        <li>We don&apos;t rank, score, or recommend one IPO over another.</li>
        <li>We don&apos;t tell you whether to apply — see our <a href="/disclaimer">Disclaimer</a>.</li>
      </ul>
      <p>
        This is unattended software reading external official and explicitly enabled provider sources. A source
        going offline or changing its response can cause a gap. That&apos;s exactly why every figure carries its own
        source and freshness information instead of asking you to trust a single blended number blindly.
      </p>

      <h2>Report a correction</h2>
      <p>
        Spotted a figure that&apos;s wrong, stale, or missing? Email{" "}
        <a href="mailto:aish.iiitb@gmail.com">aish.iiitb@gmail.com</a> with the IPO name and what looks off.
      </p>
    </LegalPage>
  );
}

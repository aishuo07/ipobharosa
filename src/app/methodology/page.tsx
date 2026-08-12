import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Methodology — IPOBharosa",
  description: "How IPOBharosa sources and aggregates GMP, subscription, financial, and document data for Indian IPOs.",
};

export default function MethodologyPage() {
  return (
    <LegalPage title="Methodology" updated="12 Aug 2026">
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
        We pull a GMP figure from three independent public sources every ingestion cycle: <strong>IPO
        Watch</strong>, <strong>Sahi</strong>, and <strong>IPO Ji</strong>. Each is scraped separately. The
        value we show is the <strong>median</strong> of whichever sources returned a number that cycle —
        if a source is down, its page layout changed, or it simply hasn&apos;t published a figure for that
        IPO yet, it is dropped from that cycle&apos;s calculation. A source going missing never blocks the
        others from reporting, and never gets treated as a zero.
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
        Our ingestion pipeline runs every 2 hours. Every GMP figure shows how long ago it was captured. If a
        value is more than 4 hours old — double our own cycle length with no successful update in between —
        we mark it <strong>Stale</strong> explicitly instead of leaving you to do that math yourself.
      </p>

      <h2>Subscription numbers</h2>
      <p>
        Unlike GMP, subscription (how many times an issue has been bid for, by QIB/NII/Retail/Employee
        category) is real exchange-reported data, not informal pricing — so it isn&apos;t aggregated across
        multiple sources the way GMP is. We read it from Sahi&apos;s day-by-day subscription table, which is
        itself explicitly sourced from NSE. We show the most recent day that has fully reported — a day still
        marked &quot;upcoming&quot; on the source table is skipped rather than shown as zero.
      </p>

      <h2>Price band, lot size, dates, registrar, lead managers</h2>
      <p>
        These come from the IPO&apos;s filing details as published on IPO Watch&apos;s page for that issue,
        which in turn draws on the RHP/exchange filing. They are single-sourced — if you spot one that&apos;s
        wrong, please report it so we can correct it and check the source.
      </p>

      <h2>How a new IPO gets added</h2>
      <p>
        Every 2-hour cycle also checks IPO Watch&apos;s public listing for issues we aren&apos;t tracking yet.
        Every candidate&apos;s facts get checked for internal consistency (a sane price band, dates in the
        right order, a lot size that&apos;s actually a positive number, and so on) before anything happens to
        it:
      </p>
      <ul>
        <li>
          <strong>Fails the consistency check</strong> — kept, not discarded, with the specific reason
          recorded, so a real inconsistency is visible rather than silently retried and re-failing forever.
        </li>
        <li>
          <strong>Consistent, and both cross-verified by a second independent source and backed by an
          official DRHP/RHP filing link</strong> — published automatically. No human touches this path, but
          every auto-published IPO is logged as such.
        </li>
        <li>
          <strong>Consistent, but missing the second source or the filing link</strong> — held as a draft
          until a human checks it against the real filing and adds the sector (which isn&apos;t something we
          try to guess automatically).
        </li>
      </ul>

      <h2>Financials</h2>
      <p>
        Revenue, PAT, and ratio figures are first pulled from Sahi&apos;s per-IPO financial summary table, but
        they are <strong>not shown</strong> until someone has manually checked them against the company&apos;s
        actual RHP filing and marked them verified. Anything not yet checked simply doesn&apos;t appear on the
        Financials tab — we&apos;d rather show nothing than show a number that hasn&apos;t been checked, with
        just a disclaimer next to it.
      </p>
      <p>
        Every verification (and every correction, if a checked figure later turns out wrong) is written to an
        audit log with who made the change, when, and why. This log isn&apos;t public yet, but it exists and
        backs every figure you see marked verified.
      </p>

      <h2>Documents (DRHP / RHP / anchor list)</h2>
      <p>
        Document links are discovered from IPO Watch&apos;s per-IPO page, but the PDFs themselves are hosted
        on the lead manager&apos;s or company&apos;s own domain — we don&apos;t host, re-upload, or modify
        them. IPO Watch is only the index we use to find the real filing.
      </p>

      <h2>What this site doesn&apos;t do</h2>
      <ul>
        <li>We don&apos;t predict listing price, listing gains, or subscription outcomes.</li>
        <li>We don&apos;t rank, score, or recommend one IPO over another.</li>
        <li>We don&apos;t tell you whether to apply — see our <a href="/disclaimer">Disclaimer</a>.</li>
      </ul>
      <p>
        This is unattended software scraping other unattended websites — a source going offline or changing
        its page layout will occasionally cause a gap. That&apos;s exactly why every figure carries its own
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

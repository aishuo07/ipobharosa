import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Terms — IPOBharosa",
  description: "Terms of use for IPOBharosa.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" updated="12 Aug 2026">
      <p>By using IPOBharosa, you agree to these terms.</p>

      <h2>What this service is</h2>
      <p>
        IPOBharosa aggregates publicly available information about Indian IPOs — grey market premium,
        subscription figures, filing dates, and financials — from third-party sources, and lets signed-in
        users maintain a watchlist and receive status-change email reminders. See our{" "}
        <a href="/methodology">Methodology</a> for exactly how that data is sourced, and our{" "}
        <a href="/disclaimer">Disclaimer</a> for what it isn&apos;t.
      </p>

      <h2>Accounts</h2>
      <p>
        You need an account (via Google sign-in or email magic link) to use the watchlist and reminder
        features. You&apos;re responsible for keeping your sign-in access secure. Don&apos;t use the service
        to scrape, automate against, or place unreasonable load on our systems.
      </p>

      <h2>No warranty</h2>
      <p>
        The service is provided &quot;as is,&quot; without warranty of any kind, express or implied, including
        accuracy, completeness, or uninterrupted availability. We rely on third-party sources and automated
        data collection, which can and occasionally will produce errors or gaps.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, IPOBharosa and its operator are not liable for any loss or
        damage — financial or otherwise — arising from your use of, or reliance on, information provided
        through this service.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms from time to time. The version at this URL is always the current one. If
        you keep using the service after a change, that means you accept the update.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms? Email <a href="mailto:aish.iiitb@gmail.com">aish.iiitb@gmail.com</a>.
      </p>
    </LegalPage>
  );
}

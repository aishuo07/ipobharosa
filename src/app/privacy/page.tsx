import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Privacy — IPOBharosa",
  description: "What IPOBharosa collects, why, and how to request access, correction, or deletion.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated="12 Aug 2026">
      <p>
        This page describes what personal data IPOBharosa collects when you create an account, and what we do
        — and don&apos;t do — with it.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>Your email address and name, from Google sign-in.</li>
        <li>The IPOs you add to your watchlist.</li>
        <li>A session token, so you stay signed in between visits.</li>
      </ul>
      <p>We don&apos;t collect PAN, bank, demat, or any other financial identifiers — the site doesn&apos;t need them and never asks for them.</p>

      <h2>Why we collect it</h2>
      <p>
        Solely to sign you in and to save your watchlist. Email status-change reminders are planned but not
        live yet — once they are, they&apos;ll only go to IPOs you&apos;ve explicitly watchlisted. We don&apos;t
        use your data for anything beyond that.
      </p>

      <h2>What we don&apos;t do</h2>
      <ul>
        <li>We don&apos;t sell your data.</li>
        <li>We don&apos;t use it for advertising or share it with advertisers.</li>
        <li>We don&apos;t show your watchlist, email, or activity to other users.</li>
        <li>We don&apos;t use tracking or analytics cookies — only the session cookie needed to keep you signed in.</li>
      </ul>

      <h2>Third parties involved</h2>
      <p>
        Sign-in is handled by <strong>Google</strong> (OAuth). Once email reminders go live, we&apos;ll use{" "}
        <strong>Resend</strong> to send them and update this page. Each processes only the minimum data
        needed to perform that function — your email address, and for Google sign-in, your name and profile
        email as shared by Google.
      </p>

      <h2>How long we keep it</h2>
      <p>Your account and watchlist data is kept for as long as your account exists.</p>

      <h2>Your rights</h2>
      <p>
        You can ask us to show you what data we hold on your account, correct it, or delete your account and
        all associated data entirely. Email{" "}
        <a href="mailto:aish.iiitb@gmail.com">aish.iiitb@gmail.com</a> to make any of these requests.
      </p>
    </LegalPage>
  );
}

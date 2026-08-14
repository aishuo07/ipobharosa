import { getEmailReadiness } from "./readiness";

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const readiness = getEmailReadiness();
  const apiKey = process.env.RESEND_API_KEY;
  if (!readiness.transportReady || !apiKey || !readiness.from) throw new Error("Resend transport is not fully configured");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: readiness.from, to, subject, html }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend send failed: HTTP ${res.status} — ${body}`);
  }
}

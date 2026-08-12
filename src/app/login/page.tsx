import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { auth, signIn } from "@/auth";

const SIGNIN_ERROR_URL = "/login/error";

// Email delivery (magic-link sign-in, reminder emails) is not live yet —
// Resend isn't configured end-to-end. Google is the only sign-in path
// until that's verified working; re-enable the form below once it is.
const EMAIL_SIGNIN_ENABLED = false;

export default async function LoginPage() {
  const session = await auth();
  if (session) redirect("/");

  return (
    <div className="wrap" style={{ maxWidth: 400, paddingTop: 64 }}>
      <span className="wordmark">IPOBharosa</span>
      <p className="section-label" style={{ marginTop: 24, marginBottom: 16 }}>
        Sign in to save a watchlist
      </p>

      <form
        action={async () => {
          "use server";
          try {
            await signIn("google", { redirectTo: "/" });
          } catch (error) {
            if (error instanceof AuthError) {
              redirect(`${SIGNIN_ERROR_URL}?error=${error.type}`);
            }
            throw error;
          }
        }}
      >
        <button className="btn btn-primary" type="submit" style={{ width: "100%" }}>
          Continue with Google
        </button>
      </form>

      {EMAIL_SIGNIN_ENABLED && (
        <>
          <div
            style={{
              textAlign: "center",
              color: "var(--ink-faint)",
              fontSize: 12,
              margin: "18px 0",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            or
          </div>

          <form
            action={async (formData) => {
              "use server";
              try {
                await signIn("resend", formData, { redirectTo: "/" });
              } catch (error) {
                if (error instanceof AuthError) {
                  redirect(`${SIGNIN_ERROR_URL}?error=${error.type}`);
                }
                throw error;
              }
            }}
          >
            <input
              type="email"
              name="email"
              placeholder="you@example.com"
              required
              className="btn"
              style={{ width: "100%", marginBottom: 10, fontWeight: 400, cursor: "text" }}
            />
            <button className="btn" type="submit" style={{ width: "100%" }}>
              Send magic link
            </button>
          </form>
        </>
      )}

      <p className="disclaimer" style={{ marginTop: 24 }}>
        We only use your Google account to save your watchlist — never for marketing. Email
        reminders are coming soon.
      </p>
    </div>
  );
}

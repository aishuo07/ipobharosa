export default async function LoginErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div className="wrap" style={{ maxWidth: 400, paddingTop: 64 }}>
      <span className="wordmark">IPOBharosa</span>
      <p className="section-label" style={{ marginTop: 24 }}>Sign-in failed</p>
      <p style={{ fontSize: 14 }}>
        {error ? `Error: ${error}. ` : ""}Please try again from the{" "}
        <a href="/login" style={{ textDecoration: "underline" }}>
          sign-in page
        </a>
        .
      </p>
    </div>
  );
}

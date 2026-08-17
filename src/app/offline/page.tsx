import Link from "next/link";

export default function OfflinePage() {
  return (
    <main className="offline-page">
      <div className="offline-mark" aria-hidden="true">IB</div>
      <p className="board-kicker">You are offline</p>
      <h1>Fresh IPO data needs a connection.</h1>
      <p>
        IPOBharosa does not show an old GMP or subscription snapshot as if it were current.
        Reconnect and try again for the latest sourced information.
      </p>
      <Link className="btn" href="/">Try again</Link>
    </main>
  );
}

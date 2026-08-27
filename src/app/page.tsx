import { getPublicIpos } from "@/lib/board-data";
import IpoBoard from "@/components/IpoBoard";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getFilingRadarEntries } from "@/lib/discovery/filing-catalogue";

export const revalidate = 60;

async function handleSignOut() {
  "use server";
  await signOut({ redirectTo: "/" });
}

export default async function Home() {
  // eslint-disable-next-line react-hooks/purity
  const initialNow = Date.now();

  let ipos: Awaited<ReturnType<typeof getPublicIpos>> = [];
  let filings: Awaited<ReturnType<typeof getFilingRadarEntries>> = [];
  let session: { user?: { id?: string; email?: string | null; name?: string | null } | null } | null = null;

  try {
    [ipos, filings, session] = await Promise.all([getPublicIpos(), getFilingRadarEntries(), auth()]);
  } catch (error) {
    // Partial failure — try each independently so partial data still renders
    console.error("[home] parallel fetch failed, retrying individually:", error);
    const results = await Promise.allSettled([getPublicIpos(), getFilingRadarEntries(), auth()]);
    ipos = results[0].status === "fulfilled" ? results[0].value : [];
    filings = results[1].status === "fulfilled" ? results[1].value : [];
    session = results[2].status === "fulfilled" ? results[2].value : null;
  }

  let watchlistedIds: string[] = [];
  if (session?.user?.id) {
    try {
      const items = await prisma.watchlistItem.findMany({
        where: { userId: session.user.id },
        select: { ipoId: true },
      });
      watchlistedIds = items.map((i) => i.ipoId);
    } catch {
      // Watchlist is non-critical — ignore DB failure
    }
  }

  return (
    <IpoBoard
      ipos={ipos}
      filings={filings}
      user={session?.user ? { email: session.user.email ?? null, name: session.user.name ?? null } : null}
      watchlistedIds={watchlistedIds}
      initialNow={initialNow}
      onSignOut={handleSignOut}
    />
  );
}

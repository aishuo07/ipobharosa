import { getPublicIpos } from "@/lib/board-data";
import IpoBoard from "@/components/IpoBoard";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getFilingRadarEntries } from "@/lib/discovery/filing-catalogue";

export const revalidate = 0;

async function handleSignOut() {
  "use server";
  await signOut({ redirectTo: "/" });
}

export default async function Home() {
  // Send one timestamp through the RSC payload so the initial Client Component
  // render exactly matches the server HTML. The board advances it after mount.
  // eslint-disable-next-line react-hooks/purity
  const initialNow = Date.now();
  const [ipos, filings, session] = await Promise.all([getPublicIpos(), getFilingRadarEntries(), auth()]);

  let watchlistedIds: string[] = [];
  if (session?.user?.id) {
    const items = await prisma.watchlistItem.findMany({
      where: { userId: session.user.id },
      select: { ipoId: true },
    });
    watchlistedIds = items.map((i) => i.ipoId);
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

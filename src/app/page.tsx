import { getBoardIpos } from "@/lib/board-data";
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
  const [ipos, filings, session] = await Promise.all([getBoardIpos(), getFilingRadarEntries(), auth()]);

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
      onSignOut={handleSignOut}
    />
  );
}

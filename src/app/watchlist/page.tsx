import { redirect } from "next/navigation";
import { getWatchlistIpos } from "@/lib/board-data";
import IpoBoard from "@/components/IpoBoard";
import { auth, signOut } from "@/auth";

export const revalidate = 0;

async function handleSignOut() {
  "use server";
  await signOut({ redirectTo: "/" });
}

export default async function WatchlistPage() {
  // Keep the initial board render identical across the RSC and browser passes.
  // eslint-disable-next-line react-hooks/purity
  const initialNow = Date.now();
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const ipos = await getWatchlistIpos(session.user.id);

  return (
    <IpoBoard
      ipos={ipos}
      user={{ email: session.user.email ?? null, name: session.user.name ?? null }}
      watchlistedIds={ipos.map((i) => i.id)}
      initialNow={initialNow}
      onSignOut={handleSignOut}
    />
  );
}

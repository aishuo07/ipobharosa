import { getBoardIpos } from "@/lib/board-data";
import { buildIcs } from "@/lib/calendar";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ipos = await getBoardIpos();
  const slug = new URL(request.url).searchParams.get("ipo");
  const selected = slug ? ipos.filter((ipo) => ipo.slug === slug) : ipos;
  if (slug && selected.length === 0) return new Response("IPO not found", { status: 404 });

  return new Response(buildIcs(selected), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${slug ?? "ipobharosa-ipo-dates"}.ics"`,
      "Cache-Control": "public, max-age=900, stale-while-revalidate=3600",
    },
  });
}

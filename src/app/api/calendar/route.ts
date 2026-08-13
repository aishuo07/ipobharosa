import { getBoardIpos } from "@/lib/board-data";
import { filterIposByBoard, parseBoardFilter } from "@/lib/board-filter";
import { buildIcs } from "@/lib/calendar";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ipos = await getBoardIpos();
  const searchParams = new URL(request.url).searchParams;
  const slug = searchParams.get("ipo");
  const board = parseBoardFilter(searchParams.get("board"));
  if (board === null) return new Response("Invalid board. Use MAINBOARD or SME.", { status: 400 });

  const boardIpos = filterIposByBoard(ipos, board);
  const selected = slug ? boardIpos.filter((ipo) => ipo.slug === slug) : boardIpos;
  if (slug && selected.length === 0) return new Response("IPO not found", { status: 404 });
  const filename = slug ?? (board === "ALL" ? "ipobharosa-ipo-dates" : `ipobharosa-${board.toLowerCase()}-ipo-dates`);

  return new Response(buildIcs(selected, board), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${filename}.ics"`,
      "Cache-Control": "public, max-age=900, stale-while-revalidate=3600",
    },
  });
}

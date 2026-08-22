import { NextResponse } from "next/server";
import { getPublicIpos } from "@/lib/board-data";
import { filterIposByBoard, parseBoardFilter } from "@/lib/board-filter";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const board = parseBoardFilter(searchParams.get("board"));
  if (board === null) {
    return NextResponse.json(
      { error: "Invalid board. Use MAINBOARD or SME." },
      { status: 400 },
    );
  }
  try {
    const ipos = await getPublicIpos();
    const boardIpos = filterIposByBoard(ipos, board);
    return NextResponse.json(boardIpos, {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "IPO data temporarily unavailable. Please try again." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

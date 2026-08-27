import type { BoardIpo } from "@/lib/board-data";
import type { PublicVerificationState } from "@/lib/public-verification";

export const BOARD_FILTERS = ["ALL", "MAINBOARD", "SME"] as const;

export type BoardFilter = (typeof BOARD_FILTERS)[number];
export type StatusFilter = BoardIpo["status"] | "ALL";
export type VerificationFilter = PublicVerificationState | "ALL";

export function parseBoardFilter(value: string | null): BoardFilter | null {
  if (value === null || value === "") return "ALL";
  return BOARD_FILTERS.includes(value as BoardFilter) ? value as BoardFilter : null;
}

export function filterIposByBoard(ipos: BoardIpo[], board: BoardFilter): BoardIpo[] {
  return board === "ALL" ? ipos : ipos.filter((ipo) => ipo.board === board);
}

export function filterIposByStatus(ipos: BoardIpo[], status: StatusFilter): BoardIpo[] {
  return status === "ALL" ? ipos : ipos.filter((ipo) => ipo.status === status);
}

export function filterIposByVerification(ipos: BoardIpo[], verification: VerificationFilter): BoardIpo[] {
  return verification === "ALL" ? ipos : ipos.filter((ipo) => ipo.verification.state === verification);
}

export function boardFilterLabel(board: BoardFilter): string {
  if (board === "MAINBOARD") return "Mainboard";
  if (board === "SME") return "SME";
  return "All IPOs";
}

export function boardFilterQuery(board: BoardFilter): string {
  return board === "ALL" ? "" : `?board=${board}`;
}

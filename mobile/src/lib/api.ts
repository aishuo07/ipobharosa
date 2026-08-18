import { isBoardIpoArray, type BoardFilter, type BoardIpo } from "@/src/lib/types";

const DEFAULT_API_URL = "https://ipobharosa.vercel.app";

export function getApiUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (configured) return configured.replace(/\/$/, "");
  return DEFAULT_API_URL;
}

export async function fetchBoard(filter: BoardFilter = "ALL"): Promise<BoardIpo[]> {
  const params = filter === "ALL" ? "" : `?board=${filter}`;
  const response = await fetch(`${getApiUrl()}/api/public/board${params}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Board request failed with status ${response.status}`);
  }
  const body = await response.json();
  if (!isBoardIpoArray(body)) {
    throw new Error("Board response did not match the expected contract");
  }
  return body;
}
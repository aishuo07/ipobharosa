import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { GET } from "./route";

const mockIpos = [
  {
    id: "ipo-1",
    slug: "technocraft-ventures",
    companyName: "Technocraft Ventures",
    board: "SME",
    status: "OPEN",
  },
];

vi.mock("@/lib/board-data", () => ({
  getPublicIpos: () => Promise.resolve(mockIpos),
}));

vi.mock("@/lib/board-filter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/board-filter")>();
  return actual;
});

describe("public board API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns the public IPO board as JSON", async () => {
    const response = await GET(new Request("https://ipobharosa.vercel.app/api/public/board"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveLength(1);
    expect(body[0].companyName).toBe("Technocraft Ventures");
  });

  it("filters by board", async () => {
    const response = await GET(new Request("https://ipobharosa.vercel.app/api/public/board?board=SME"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveLength(1);
    expect(body[0].board).toBe("SME");
  });

  it("rejects an invalid board filter", async () => {
    const response = await GET(new Request("https://ipobharosa.vercel.app/api/public/board?board=FOO"));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("Invalid board");
  });

  it("sets a short public cache lifetime", async () => {
    const response = await GET(new Request("https://ipobharosa.vercel.app/api/public/board"));
    expect(response.headers.get("Cache-Control")).toContain("max-age=60");
  });

  it("allows cross-origin reads for the public board", async () => {
    const response = await GET(new Request("https://ipobharosa.vercel.app/api/public/board"));
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});
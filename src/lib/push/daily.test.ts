import { describe, expect, it, vi, beforeEach } from "vitest";

type BroadcastRow = {
  id: string;
  kind: string;
  broadcastDate: Date;
  title: string;
  body: string;
  sentCount: number;
  failedCount: number;
};

let broadcasts: BroadcastRow[] = [];
let ipoRows: unknown[] = [];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    pushBroadcast: {
      findUnique: async ({ where }: { where: { kind_broadcastDate: { kind: string; broadcastDate: Date } } }) => {
        return broadcasts.find(
          (row) =>
            row.kind === where.kind_broadcastDate.kind &&
            row.broadcastDate.getTime() === where.kind_broadcastDate.broadcastDate.getTime(),
        ) ?? null;
      },
      create: async ({ data }: { data: BroadcastRow }) => {
        broadcasts.push(data);
        return data;
      },
    },
    ipo: {
      findMany: async () => ipoRows,
    },
  },
}));

vi.mock("@/lib/push/expo", () => ({
  sendPushBroadcast: vi.fn(async () => ({ accepted: 2, failed: 0, invalidTokens: [] })),
}));

import { broadcastDateInIst, buildDailyPushMessage, sendDailyPush } from "./daily";
import { sendPushBroadcast } from "@/lib/push/expo";

beforeEach(() => {
  broadcasts = [];
  ipoRows = [];
  vi.mocked(sendPushBroadcast).mockClear();
});

describe("broadcastDateInIst", () => {
  it("returns the UTC-midnight date for the IST calendar day", () => {
    // 2026-08-20 07:00 UTC = 2026-08-20 12:30 IST
    const date = broadcastDateInIst(new Date("2026-08-20T07:00:00.000Z"));
    expect(date.toISOString()).toBe("2026-08-20T00:00:00.000Z");
  });
});

describe("buildDailyPushMessage", () => {
  it("summarises today's milestones and open issues", async () => {
    ipoRows = [
      {
        id: "1",
        company: { name: "Gaja Alternative" },
        status: "OPEN",
        openDate: "2026-08-19T00:00:00.000Z",
        closeDate: "2026-08-21T00:00:00.000Z",
        allotmentDate: "2026-08-25T00:00:00.000Z",
        listingDate: "2026-08-27T00:00:00.000Z",
        priceBandLow: 100,
        priceBandHigh: 110,
        gmpSnapshots: [{ medianValue: 25 }],
      },
      {
        id: "2",
        company: { name: "Solo Open" },
        status: "OPEN",
        openDate: "2026-08-20T00:00:00.000Z",
        closeDate: "2026-08-20T00:00:00.000Z",
        allotmentDate: "2026-08-23T00:00:00.000Z",
        listingDate: "2026-08-26T00:00:00.000Z",
        priceBandLow: 50,
        priceBandHigh: 60,
        gmpSnapshots: [],
      },
    ];
    const message = await buildDailyPushMessage(new Date("2026-08-20T07:00:00.000Z"));
    expect(message).toContain("Opening today: Solo Open");
    expect(message).toContain("Closing today: Solo Open");
    expect(message).toContain("Open for bidding: Gaja Alternative · GMP ₹25");
  });
});

describe("sendDailyPush", () => {
  it("skips when today's broadcast already exists", async () => {
    broadcasts.push({
      id: "x",
      kind: "daily",
      broadcastDate: new Date("2026-08-20T00:00:00.000Z"),
      title: "T",
      body: "B",
      sentCount: 5,
      failedCount: 0,
    });
    const result = await sendDailyPush(new Date("2026-08-20T07:00:00.000Z"));
    expect(result.skipped).toBe(true);
    expect(result.sent).toBe(false);
  });

  it("sends once when nothing exists for the day", async () => {
    ipoRows = [];
    const result = await sendDailyPush(new Date("2026-08-20T07:00:00.000Z"));
    expect(result.sent).toBe(true);
    expect(result.skipped).toBe(false);
    expect(broadcasts.length).toBe(1);
  });
});
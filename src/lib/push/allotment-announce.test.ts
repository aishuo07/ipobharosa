import { describe, expect, it, vi, beforeEach } from "vitest";
import type { RegistrarKey } from "@/lib/allotment-core/catalogue/types";

type AnnounceRow = { id: string; ipoId: string; companyName: string; registrar: string | null };

const announced = new Map<string, AnnounceRow>();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    allotmentAnnouncement: {
      findUnique: async ({ where }: { where: { ipoId: string } }) => {
        return announced.get(where.ipoId) ?? null;
      },
      create: async ({ data }: { data: AnnounceRow }) => {
        announced.set(data.ipoId, data);
        return data;
      },
    },
  },
}));

vi.mock("@/lib/push/expo", () => ({
  sendPushBroadcast: vi.fn(async () => ({ accepted: 2, failed: 0, invalidTokens: [] })),
}));

import { announceAllotmentLaunches } from "./allotment-announce";
import { sendPushBroadcast } from "@/lib/push/expo";

const mockedSend = vi.mocked(sendPushBroadcast);

beforeEach(() => {
  announced.clear();
  mockedSend.mockClear();
});

const check = {
  checkedAt: "2026-08-20T00:00:00.000Z",
  launched: [
    { ipoId: "ipo-1", companyName: "Gaja Alternative", registrar: "KFinTech", registrarKey: "kfin" as RegistrarKey },
    { ipoId: "ipo-2", companyName: "Solo Open", registrar: "Bigshare", registrarKey: "bigshare" as RegistrarKey },
  ],
  notLaunched: [],
  unknownRegistrar: [],
};

describe("announceAllotmentLaunches", () => {
  it("announces each new launch exactly once and records the announcement", async () => {
    const summary = await announceAllotmentLaunches(check);
    expect(summary.announced).toBe(2);
    expect(summary.failed).toBe(0);
    expect(mockedSend).toHaveBeenCalledTimes(2);
    expect(announced.has("ipo-1")).toBe(true);
    expect(announced.has("ipo-2")).toBe(true);
  });

  it("skips launches already announced", async () => {
    announced.set("ipo-1", { id: "x", ipoId: "ipo-1", companyName: "Gaja Alternative", registrar: "KFinTech" });
    const summary = await announceAllotmentLaunches(check);
    expect(summary.announced).toBe(1);
    expect(summary.alreadyAnnounced).toBe(1);
    expect(mockedSend).toHaveBeenCalledTimes(1);
    const callArgs = mockedSend.mock.calls[0][0];
    expect(callArgs.data).toMatchObject({ type: "allotment", ipoId: "ipo-2" });
    expect(callArgs.title).toBe("Allotment result is out");
  });

  it("does not write the dedup row when the push fails, so it retries next run", async () => {
    mockedSend.mockRejectedValueOnce(new Error("push service down"));
    const summary = await announceAllotmentLaunches(check);
    expect(summary.announced).toBe(1);
    expect(summary.failed).toBe(1);
    // ipo-1 failed (no row), ipo-2 succeeded (row written)
    expect(announced.has("ipo-1")).toBe(false);
    expect(announced.has("ipo-2")).toBe(true);
  });
});
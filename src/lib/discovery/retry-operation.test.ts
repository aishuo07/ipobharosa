import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  acquire: vi.fn(),
  release: vi.fn(),
  revalidate: vi.fn(),
  correctionCreate: vi.fn(),
}));

vi.mock("@/lib/ingestion/lock", () => ({
  acquireIngestionLock: mocks.acquire,
  releaseIngestionLock: mocks.release,
}));
vi.mock("./revalidate", () => ({ revalidateCandidateById: mocks.revalidate }));
vi.mock("@/lib/prisma", () => ({ prisma: { correctionLog: { create: mocks.correctionCreate } } }));

import { retryOfficialVerificationNow } from "./retry-operation";

describe("targeted official retry operation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.acquire.mockResolvedValue(true);
    mocks.release.mockResolvedValue(undefined);
    mocks.correctionCreate.mockResolvedValue({});
    mocks.revalidate.mockResolvedValue({ company: "Test IPO", outcome: "PUBLISHED", reasons: [] });
  });

  it("does nothing when the ingestion lock is busy", async () => {
    mocks.acquire.mockResolvedValue(false);

    await expect(retryOfficialVerificationNow("ipo-1", "admin@example.com")).resolves.toEqual({ status: "BUSY" });
    expect(mocks.revalidate).not.toHaveBeenCalled();
    expect(mocks.correctionCreate).not.toHaveBeenCalled();
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it("revalidates, audits and releases the lock", async () => {
    const result = await retryOfficialVerificationNow("ipo-1", "admin@example.com");

    expect(result).toEqual({ status: "COMPLETED", result: { company: "Test IPO", outcome: "PUBLISHED", reasons: [] } });
    expect(mocks.acquire).toHaveBeenCalledWith("admin-retry:admin@example.com");
    expect(mocks.revalidate).toHaveBeenCalledWith("ipo-1");
    expect(mocks.correctionCreate).toHaveBeenCalledWith({ data: expect.objectContaining({
      entityId: "ipo-1",
      action: "retry-official-verification",
      performedBy: "admin@example.com",
    }) });
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it("reports a non-retryable row and still releases the lock", async () => {
    mocks.revalidate.mockResolvedValue({ company: null, outcome: "EMPTY", reasons: [] });

    await expect(retryOfficialVerificationNow("ipo-1", "admin@example.com")).resolves.toEqual({ status: "NOT_RETRYABLE" });
    expect(mocks.correctionCreate).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it("releases the lock when revalidation fails", async () => {
    mocks.revalidate.mockRejectedValue(new Error("BSE timeout"));

    await expect(retryOfficialVerificationNow("ipo-1", "admin@example.com")).rejects.toThrow("BSE timeout");
    expect(mocks.release).toHaveBeenCalledOnce();
  });
});

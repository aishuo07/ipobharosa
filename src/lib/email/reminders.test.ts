import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

type SendEmailArgs = { to: string; subject: string; html: string };

type DeliveryRow = {
  userId: string;
  ipoId: string;
  transition: string;
  status: "SENT" | "FAILED";
  attempts: number;
  lastError: string | null;
};

let watchers: { userId: string; user: { email: string | null } }[] = [];
let deliveries: DeliveryRow[] = [];
let sendMock: Mock<(args: SendEmailArgs) => Promise<void>>;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    watchlistItem: {
      findMany: async () => watchers,
    },
    reminderDelivery: {
      findUnique: async ({ where }: { where: { userId_ipoId_transition: { userId: string; ipoId: string; transition: string } } }) => {
        const k = where.userId_ipoId_transition;
        return deliveries.find((d) => d.userId === k.userId && d.ipoId === k.ipoId && d.transition === k.transition) ?? null;
      },
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { userId_ipoId_transition: { userId: string; ipoId: string; transition: string } };
        create: DeliveryRow;
        update: Partial<DeliveryRow>;
      }) => {
        const k = where.userId_ipoId_transition;
        const existing = deliveries.find((d) => d.userId === k.userId && d.ipoId === k.ipoId && d.transition === k.transition);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row = { ...create };
        deliveries.push(row);
        return row;
      },
    },
  },
}));

vi.mock("@/lib/email/resend", () => ({
  sendEmail: (args: SendEmailArgs) => sendMock(args),
}));

const { notifyWatchersOfTransitions } = await import("./reminders");

describe("notifyWatchersOfTransitions", () => {
  beforeEach(() => {
    watchers = [{ userId: "u1", user: { email: "u1@example.com" } }];
    deliveries = [];
    sendMock = vi.fn();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends and records a SENT delivery for a first-time transition", async () => {
    sendMock.mockResolvedValue(undefined);

    const summary = await notifyWatchersOfTransitions([
      { ipoId: "ipo1", companyName: "Test Co", from: "UPCOMING", to: "OPEN" },
    ]);

    expect(summary).toEqual({ sent: 1, failed: 0, skipped: 0 });
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(deliveries).toEqual([
      expect.objectContaining({ userId: "u1", ipoId: "ipo1", transition: "UPCOMING->OPEN", status: "SENT" }),
    ]);
  });

  it("skips a watcher whose delivery is already marked SENT — never double-emails", async () => {
    deliveries = [{ userId: "u1", ipoId: "ipo1", transition: "UPCOMING->OPEN", status: "SENT", attempts: 1, lastError: null }];
    sendMock.mockResolvedValue(undefined);

    const summary = await notifyWatchersOfTransitions([
      { ipoId: "ipo1", companyName: "Test Co", from: "UPCOMING", to: "OPEN" },
    ]);

    expect(summary).toEqual({ sent: 0, failed: 0, skipped: 1 });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("retries a failing send up to the max attempts, then records FAILED with the error visible", async () => {
    sendMock.mockRejectedValue(new Error("Resend send failed: HTTP 422"));

    const promise = notifyWatchersOfTransitions([
      { ipoId: "ipo1", companyName: "Test Co", from: "UPCOMING", to: "OPEN" },
    ]);
    await vi.runAllTimersAsync();
    const summary = await promise;

    expect(summary).toEqual({ sent: 0, failed: 1, skipped: 0 });
    expect(sendMock).toHaveBeenCalledTimes(3);
    expect(deliveries).toEqual([
      expect.objectContaining({
        status: "FAILED",
        attempts: 3,
        lastError: expect.stringContaining("422"),
      }),
    ]);
  });

  it("retries a previously-FAILED delivery on the next run and marks it SENT if it now succeeds", async () => {
    deliveries = [{ userId: "u1", ipoId: "ipo1", transition: "UPCOMING->OPEN", status: "FAILED", attempts: 3, lastError: "timeout" }];
    sendMock.mockResolvedValue(undefined);

    const summary = await notifyWatchersOfTransitions([
      { ipoId: "ipo1", companyName: "Test Co", from: "UPCOMING", to: "OPEN" },
    ]);

    expect(summary).toEqual({ sent: 1, failed: 0, skipped: 0 });
    expect(deliveries[0]).toEqual(
      expect.objectContaining({ status: "SENT", attempts: 4, lastError: null }),
    );
  });

  it("skips watchers with no email on the account rather than erroring", async () => {
    watchers = [{ userId: "u1", user: { email: null } }];

    const summary = await notifyWatchersOfTransitions([
      { ipoId: "ipo1", companyName: "Test Co", from: "UPCOMING", to: "OPEN" },
    ]);

    expect(summary).toEqual({ sent: 0, failed: 0, skipped: 0 });
    expect(sendMock).not.toHaveBeenCalled();
  });
});

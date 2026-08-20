import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { GET, POST, DELETE } from "./route";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ipo: {
      findUnique: vi.fn(),
    },
    ipoComment: {
      findMany: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const mockAuth = vi.mocked(auth);
const mockFindUnique = vi.mocked(prisma.ipo.findUnique);
const mockFindMany = vi.mocked(prisma.ipoComment.findMany);
const mockCreate = vi.mocked(prisma.ipoComment.create);
const mockDeleteMany = vi.mocked(prisma.ipoComment.deleteMany);

const ipoId = "ipo-1";
const url = `https://ipobharosa.vercel.app/api/ipo/${ipoId}/comments`;

describe("IPO comments API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindUnique.mockResolvedValue({ publicationState: "PUBLISHED" } as never);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns 404 for an unpublished IPO on GET", async () => {
    mockFindUnique.mockResolvedValueOnce({ publicationState: "DRAFT" } as never);
    const response = await GET(new Request(url), { params: Promise.resolve({ ipoId }) });
    expect(response.status).toBe(404);
  });

  it("lists comments publicly without auth", async () => {
    mockAuth.mockResolvedValueOnce(null as never);
    mockFindMany.mockResolvedValueOnce([{ id: "c1", body: "Hello", createdAt: new Date(), userId: "u1", user: { name: "A" } }] as never);
    const response = await GET(new Request(url), { params: Promise.resolve({ ipoId }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.comments).toHaveLength(1);
    expect(body.comments[0].body).toBe("Hello");
    expect(body.comments[0].canDelete).toBe(false);
  });

  it("marks the viewer's own comments canDelete=true", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: "u1" } } as never);
    mockFindMany.mockResolvedValueOnce([{ id: "c1", body: "Hi", createdAt: new Date(), userId: "u1", user: { name: "A" } }] as never);
    const response = await GET(new Request(url), { params: Promise.resolve({ ipoId }) });
    const body = await response.json();
    expect(body.comments[0].canDelete).toBe(true);
  });

  it("requires auth to post", async () => {
    mockAuth.mockResolvedValueOnce(null as never);
    const response = await POST(new Request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "Hello" }),
    }), { params: Promise.resolve({ ipoId }) });
    expect(response.status).toBe(401);
  });

  it("rejects an empty comment", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: "u1" } } as never);
    const response = await POST(new Request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "   " }),
    }), { params: Promise.resolve({ ipoId }) });
    expect(response.status).toBe(400);
  });

  it("rejects comments over 500 characters", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: "u1" } } as never);
    const response = await POST(new Request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "x".repeat(501) }),
    }), { params: Promise.resolve({ ipoId }) });
    expect(response.status).toBe(400);
  });

  it("creates a comment for an authenticated user", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: "u1" } } as never);
    mockCreate.mockResolvedValueOnce({ id: "c1", body: "Great IPO", createdAt: new Date(), user: { name: "A" } } as never);
    const response = await POST(new Request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "Great IPO" }),
    }), { params: Promise.resolve({ ipoId }) });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.comment.body).toBe("Great IPO");
    expect(body.comment.canDelete).toBe(true);
  });

  it("only lets the owner delete a comment", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: "u1" } } as never);
    mockDeleteMany.mockResolvedValueOnce({ count: 1 } as never);
    const response = await DELETE(new Request(`${url}?id=c1`), { params: Promise.resolve({ ipoId }) });
    expect(response.status).toBe(200);
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { id: "c1", ipoId, userId: "u1" },
    });
  });

  it("returns 404 deleting someone else's comment", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: "u1" } } as never);
    mockDeleteMany.mockResolvedValueOnce({ count: 0 } as never);
    const response = await DELETE(new Request(`${url}?id=c1`), { params: Promise.resolve({ ipoId }) });
    expect(response.status).toBe(404);
  });
});
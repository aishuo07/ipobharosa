import * as Sentry from "@sentry/nextjs";

export async function logApiError(route: string, error: unknown, extra?: Record<string, unknown>) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  Sentry.captureException(error, {
    tags: { route, type: "api-error" },
    extra,
  });

  // Also store in DB (best-effort, don't block the response)
  try {
    const { prisma } = await import("@/lib/prisma");
    await prisma.errorLog.create({
      data: {
        level: "error",
        message: message.slice(0, 500),
        route,
        details: JSON.stringify({ stack: stack?.slice(0, 1000), ...extra }).slice(0, 2000),
      },
    });
  } catch {
    // DB write failed — Sentry already has it
  }
}

export async function logApiInfo(route: string, message: string, extra?: Record<string, unknown>) {
  Sentry.addBreadcrumb({ category: "api", message, level: "info", data: { route, ...extra } });
}

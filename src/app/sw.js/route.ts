import { SERVICE_WORKER_SOURCE } from "@/lib/service-worker";

export const dynamic = "force-static";

export function GET() {
  return new Response(SERVICE_WORKER_SOURCE, {
    headers: {
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Content-Type": "application/javascript; charset=utf-8",
      "Service-Worker-Allowed": "/",
    },
  });
}

import { describe, expect, it } from "vitest";
import {
  OFFLINE_URL,
  SERVICE_WORKER_CACHE_PREFIX,
  SERVICE_WORKER_SOURCE,
} from "./service-worker";

describe("IPOBharosa service worker", () => {
  it("caches an offline shell and static icons", () => {
    expect(SERVICE_WORKER_SOURCE).toContain(`const OFFLINE_URL = "${OFFLINE_URL}"`);
    expect(SERVICE_WORKER_SOURCE).toContain("cache.addAll");
  });

  it("never intercepts private or API navigation", () => {
    for (const prefix of ["/api/", "/admin", "/login", "/watchlist"]) {
      expect(SERVICE_WORKER_SOURCE).toContain(JSON.stringify(prefix));
    }
    expect(SERVICE_WORKER_SOURCE).toContain("PRIVATE_PREFIXES.some");
  });

  it("removes old app caches during activation", () => {
    expect(SERVICE_WORKER_CACHE_PREFIX).toBe("ipobharosa");
    expect(SERVICE_WORKER_SOURCE).toContain("caches.delete(key)");
    expect(SERVICE_WORKER_SOURCE).toContain("key.startsWith(CACHE_PREFIX)");
  });
});

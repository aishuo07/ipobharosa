import { describe, expect, it } from "vitest";
import { publicSecurityHeaders } from "./security-headers";

describe("public browser security headers", () => {
  const values = Object.fromEntries(publicSecurityHeaders.map(({ key, value }) => [key, value]));

  it("prevents framing, MIME sniffing, and broad referrer leakage", () => {
    expect(values["X-Frame-Options"]).toBe("DENY");
    expect(values["X-Content-Type-Options"]).toBe("nosniff");
    expect(values["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("uses a functional restrictive baseline CSP", () => {
    expect(values["Content-Security-Policy"]).toContain("default-src 'self'");
    expect(values["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(values["Content-Security-Policy"]).toContain("object-src 'none'");
    expect(values["Content-Security-Policy"]).toContain("form-action 'self'");
  });

  it("does not grant sensitive browser capabilities", () => {
    expect(values["Permissions-Policy"]).toContain("camera=()");
    expect(values["Permissions-Policy"]).toContain("microphone=()");
    expect(values["Permissions-Policy"]).toContain("payment=()");
  });
});

import type { NextConfig } from "next";
import { publicSecurityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["pg"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: publicSecurityHeaders,
      },
    ];
  },
};

export default nextConfig;

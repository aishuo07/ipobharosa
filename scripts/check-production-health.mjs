const baseUrl = (process.env.SITE_URL || "https://ipobharosa.vercel.app").replace(/\/$/, "");
const timeoutMs = 20_000;

async function check(path, description, validate) {
  const response = await fetch(`${baseUrl}${path}`, {
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "user-agent": "IPOBharosaHealthMonitor/1.0" },
  });
  if (!response.ok) throw new Error(`${description} returned HTTP ${response.status}`);
  if (validate) await validate(response);
  console.log(`PASS ${description}`);
}

try {
  await check("/", "public board");
  await check("/ipo/technocraft-ventures", "representative IPO detail");
  await check("/login", "authentication entry point");
  await check("/manifest.webmanifest", "PWA manifest", async (response) => {
    const manifest = await response.json();
    if (manifest.short_name !== "IPOBharosa" || manifest.display !== "standalone") {
      throw new Error("PWA manifest contract is incomplete");
    }
  });
  await check("/api/health", "database and ingestion freshness", async (response) => {
    const health = await response.json();
    if (health.status !== "ok" || health.database !== "reachable" || health.ingestion?.status !== "fresh") {
      throw new Error("Production health contract is degraded");
    }
  });
  console.log(`Production health checks passed for ${baseUrl}`);
} catch (error) {
  console.error(`Production health check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

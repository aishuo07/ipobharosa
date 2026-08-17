const baseUrl = (process.argv[2] ?? process.env.PREVIEW_URL ?? "").replace(/\/$/, "");

if (!baseUrl) {
  console.error("Usage: npm run smoke:preview -- https://preview.example.com");
  process.exit(1);
}

async function expectResponse(path, allowedStatuses, description) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: "follow" });
  if (!allowedStatuses.includes(response.status)) {
    throw new Error(`${description}: expected ${allowedStatuses.join("/")}, received ${response.status}`);
  }
  console.log(`PASS ${description}: ${response.status} ${path}`);
  return response;
}

const board = await expectResponse("/", [200], "Board renders");
const boardHtml = await board.text();
const canonicalMatch = boardHtml.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)
  ?? boardHtml.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
if (!canonicalMatch) throw new Error("Board is missing a canonical URL");

const canonical = new URL(canonicalMatch[1], baseUrl);
const robots = await expectResponse("/robots.txt", [200], "Robots contract renders");
const robotsText = await robots.text();
const expectedSitemap = `${canonical.origin}/sitemap.xml`;
if (!robotsText.includes(`Sitemap: ${expectedSitemap}`)) {
  throw new Error(`robots.txt sitemap does not match canonical origin ${canonical.origin}`);
}

const sitemap = await expectResponse("/sitemap.xml", [200], "Sitemap renders");
const sitemapText = await sitemap.text();
const locations = [...sitemapText.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
if (locations.length === 0) throw new Error("Sitemap contains no locations");
if (locations.some((location) => new URL(location).origin !== canonical.origin)) {
  throw new Error(`Sitemap contains an origin different from canonical ${canonical.origin}`);
}
console.log(`PASS Canonical, robots and sitemap agree: ${canonical.origin}`);

const detail = await expectResponse("/ipo/technocraft-ventures", [200], "Seeded IPO detail renders");
const detailHtml = await detail.text();
const detailCanonicalMatch = detailHtml.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)
  ?? detailHtml.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
if (!detailCanonicalMatch || new URL(detailCanonicalMatch[1], baseUrl).origin !== canonical.origin) {
  throw new Error("IPO detail canonical does not match the public canonical origin");
}
console.log("PASS IPO detail canonical uses the public origin");

const health = await expectResponse(
  "/api/admin/extract-all-financials",
  [200],
  "Backend financial-pipeline health endpoint responds",
);
const healthBody = await health.json();
if (typeof healthBody !== "object" || healthBody === null || !("message" in healthBody)) {
  throw new Error("Backend health endpoint returned an unexpected body");
}

const unauthorized = await fetch(`${baseUrl}/api/admin/extract-all-financials`, {
  method: "POST",
  headers: { "content-type": "application/json" },
});
if (![401, 503].includes(unauthorized.status)) {
  throw new Error(`Admin POST must fail closed without credentials; received ${unauthorized.status}`);
}
console.log(`PASS Admin POST fails closed: ${unauthorized.status}`);

console.log(`Preview smoke checks passed for ${baseUrl}`);

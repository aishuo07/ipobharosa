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

await expectResponse("/", [200], "Board renders");
await expectResponse("/ipo/technocraft-ventures", [200], "Seeded IPO detail renders");

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

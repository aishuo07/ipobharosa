import https from "node:https";

const BSE_API_HOST = "api.bseindia.com";
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 15_000;
const ALLOWED_PATHS = [
  "/BseIndiaAPI/api/GetPublicIssue_par_updated/w",
  "/BseIndiaAPI/api/HomePage_Issues_BBS_Landing_ng/w",
  "/BseIndiaAPI/api/GetMkt_ISSUE_BBS_IPO/w",
] as const;

export type BseRequest = (url: URL) => Promise<string>;

export function assertAllowedBseUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== BSE_API_HOST || !ALLOWED_PATHS.includes(url.pathname as (typeof ALLOWED_PATHS)[number])) {
    throw new Error(`BSE URL is not allowed: ${url.origin}${url.pathname}`);
  }
  return url;
}

function requestBse(url: URL): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = https.get({
      protocol: "https:",
      hostname: BSE_API_HOST,
      path: `${url.pathname}${url.search}`,
      method: "GET",
      insecureHTTPParser: true,
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "identity",
        Referer: "https://www.bseindia.com/markets/PublicIssues/IPOIssues?id=1&Type=P",
        "User-Agent": "Mozilla/5.0",
      },
      timeout: TIMEOUT_MS,
    }, (response) => {
      if ((response.statusCode ?? 0) !== 200) {
        response.resume();
        reject(new Error(`BSE HTTP ${response.statusCode ?? "unknown"}`));
        return;
      }
      let size = 0;
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_RESPONSE_BYTES) {
          request.destroy(new Error("BSE response exceeded 5 MiB"));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
    request.on("timeout", () => request.destroy(new Error("BSE request timed out")));
    request.on("error", reject);
  });
}

export async function getBseJson<T>(value: string, request: BseRequest = requestBse): Promise<T> {
  const url = assertAllowedBseUrl(value);
  const text = await request(url);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("BSE returned invalid JSON");
  }
}

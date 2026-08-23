#!/usr/bin/env node
/**
 * IPOBharosa — Unified Allotment Checker
 *
 * Checks IPO allotment across all registrars for a given PAN.
 *
 * Usage:
 *   node scripts/check-allotment.mjs --pan ABCDE1234F
 *   node scripts/check-allotment.mjs --pan ABCDE1234F --company "Horizon Industrial Parks"
 *   node scripts/check-allotment.mjs --pan ABCDE1234F --registrar mas
 *
 * Supported Registrars:
 *   - KFin (no CAPTCHA, API-based)
 *   - Bigshare (no CAPTCHA, form-based)
 *   - Maashitla (no CAPTCHA, API-based)
 *   - MUFG/Link Intime (no CAPTCHA, API-based)
 *   - MAS Services (no CAPTCHA, direct POST)
 *   - Purva Sharegistry (math CAPTCHA, solvable)
 *   - Cameo Corporate (image CAPTCHA, needs Playwright)
 *   - Skyline Financial (image CAPTCHA, needs Playwright)
 */

const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : undefined;
}

const PAN = getArg("pan")?.toUpperCase();
const COMPANY = getArg("company");
const REGISTRAR = getArg("registrar");
const BASE_URL = getArg("url") || "https://ipobharosa.vercel.app";

if (!PAN) {
  console.error("Usage: node check-allotment.mjs --pan <PAN> [--company <NAME>] [--registrar <KEY>]");
  console.error("");
  console.error("Examples:");
  console.error("  node check-allotment.mjs --pan ABCDE1234F");
  console.error("  node check-allotment.mjs --pan ABCDE1234F --company 'Horizon Industrial Parks'");
  console.error("  node check-allotment.mjs --pan ABCDE1234F --registrar mas");
  process.exit(1);
}

const REGISTRARS = {
  kfin: { name: "KFinTech", endpoint: "/api/registrar/kfin/search", needsCompanyId: true },
  bigshare: { name: "Bigshare", endpoint: "/api/registrar/bigshare/search", needsCompanyId: true },
  maashitla: { name: "Maashitla", endpoint: "/api/registrar/maashitla/search", needsCompanyId: true },
  mufg: { name: "MUFG/Link Intime", endpoint: "/api/registrar/mufg/search", needsCompanyId: false },
  mas: { name: "MAS Services", endpoint: "/api/registrar/mas/search", needsCompanyId: false },
  purva: { name: "Purva Sharegistry", endpoint: "/api/registrar/purva/search", needsCompanyId: false },
  cameo: { name: "Cameo Corporate", endpoint: "/api/registrar/cameo/search", needsCompanyId: true },
  skyline: { name: "Skyline Financial", endpoint: "/api/registrar/skyline/search", needsCompanyId: true },
};

async function checkRegistrar(key, registrar, pan, companyId) {
  const body = { PAN: pan };
  if (companyId) body.company_code = companyId;

  try {
    const res = await fetch(`${BASE_URL}${registrar.endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    const data = await res.json();
    return { key, name: registrar.name, ok: data.ok ?? false, data };
  } catch (e) {
    return { key, name: registrar.name, ok: false, error: e.message };
  }
}

async function main() {
  console.log(`\n🔍 IPOBharosa Allotment Checker`);
  console.log(`   PAN: ${PAN}`);
  if (COMPANY) console.log(`   Company: ${COMPANY}`);
  console.log(`   Base URL: ${BASE_URL}\n`);

  const toCheck = REGISTRAR
    ? { [REGISTRAR]: REGISTRARS[REGISTRAR] }
    : REGISTRARS;

  const results = [];

  for (const [key, registrar] of Object.entries(toCheck)) {
    process.stdout.write(`   ${registrar.name}... `);
    const result = await checkRegistrar(key, registrar, PAN, COMPANY);
    results.push(result);

    if (result.error) {
      console.log(`❌ ${result.error}`);
    } else if (result.data.requires_captcha) {
      console.log(`🔐 CAPTCHA required`);
    } else if (result.data.results?.length > 0) {
      console.log(`✅ ${result.data.results.length} result(s)`);
      for (const r of result.data.results) {
        console.log(`      ${r.company}: ${r.status} (${r.shares} shares, ₹${r.amount})`);
      }
    } else if (result.data.ok) {
      console.log(`✅ No allotment found`);
    } else {
      console.log(`⚠️  ${result.data.error || "Unknown response"}`);
    }
  }

  // Summary
  const successful = results.filter((r) => r.ok && !r.data?.requires_captcha);
  const captchaRequired = results.filter((r) => r.data?.requires_captcha);
  const failed = results.filter((r) => !r.ok && !r.data?.requires_captcha);

  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Successful: ${successful.length}/${results.length}`);
  console.log(`   🔐 CAPTCHA required: ${captchaRequired.length}`);
  console.log(`   ❌ Failed: ${failed.length}`);

  if (captchaRequired.length > 0) {
    console.log(`\n   CAPTCHA-bound registrars need Playwright scripts:`);
    for (const r of captchaRequired) {
      console.log(`   - ${r.name}: node scripts/${r.key}-allotment-check.mjs --pan ${PAN} --company <CODE>`);
    }
  }
}

main();

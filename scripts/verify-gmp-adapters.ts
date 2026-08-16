import { ipoWatchAdapter } from "../src/lib/gmp/adapters/ipowatch";
import { sahiAdapter } from "../src/lib/gmp/adapters/sahi";
import { ipojiAdapter } from "../src/lib/gmp/adapters/ipoji";
import { investorGainAdapter } from "../src/lib/gmp/adapters/investorgain";

const companies = ["Dhoot Transmission Ltd", "Molbio Diagnostics Ltd", "Credent Connect N Care", "Skytech Infinite Platform", "Technocrats Plasma", "ENS Enterprises"];

async function main() {
  for (const company of companies) {
    for (const adapter of [ipoWatchAdapter, sahiAdapter, ipojiAdapter, investorGainAdapter]) {
      try {
        const value = await adapter.fetchGmp(company);
        console.log(`${adapter.key.padEnd(10)} ${company.padEnd(28)} -> ₹${value}`);
      } catch (e) {
        console.log(`${adapter.key.padEnd(10)} ${company.padEnd(28)} -> ERROR: ${(e as Error).message}`);
      }
    }
  }
}

main();

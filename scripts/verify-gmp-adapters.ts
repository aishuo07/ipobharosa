import { ipoWatchAdapter } from "../src/lib/gmp/adapters/ipowatch";
import { sahiAdapter } from "../src/lib/gmp/adapters/sahi";

const companies = ["Dhoot Transmission Ltd", "Molbio Diagnostics Ltd", "Technocraft Ventures Ltd"];

async function main() {
  for (const company of companies) {
    for (const adapter of [ipoWatchAdapter, sahiAdapter]) {
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

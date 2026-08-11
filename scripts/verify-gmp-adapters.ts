import { ipoWatchAdapter } from "../src/lib/gmp/adapters/ipowatch";
import { sahiAdapter } from "../src/lib/gmp/adapters/sahi";
import { ipojiAdapter } from "../src/lib/gmp/adapters/ipoji";

const companies = ["Dhoot Transmission Ltd", "Molbio Diagnostics Ltd", "Technocraft Ventures Ltd", "Milky Mist Dairy Food Ltd", "LEAP India Pvt Ltd", "Shiprocket Ltd"];

async function main() {
  for (const company of companies) {
    for (const adapter of [ipoWatchAdapter, sahiAdapter, ipojiAdapter]) {
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

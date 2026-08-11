import { sahiSubscriptionAdapter } from "../src/lib/subscription/adapters/sahi";

const companies = ["Dhoot Transmission Ltd", "Molbio Diagnostics Ltd", "Technocraft Ventures Ltd"];

async function main() {
  for (const company of companies) {
    try {
      const result = await sahiSubscriptionAdapter.fetchSubscription(company);
      console.log(
        company,
        `-> QIB ${result.qibX}x, NII ${result.niiX}x, Retail ${result.retailX}x, EMP ${result.employeeX ?? "n/a"}, source ${result.sourceExchange}`,
      );
    } catch (e) {
      console.log(company, "-> ERROR:", (e as Error).message);
    }
  }
}

main();

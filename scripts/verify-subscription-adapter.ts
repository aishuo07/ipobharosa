import { sahiSubscriptionAdapter } from "../src/lib/subscription/adapters/sahi";

const companies = ["Dhoot Transmission Ltd", "Molbio Diagnostics Ltd", "Technocraft Ventures Ltd"];

async function main() {
  for (const company of companies) {
    try {
      const result = await sahiSubscriptionAdapter.fetchSubscription(company);
      if (result.kind !== "VALUE") {
        console.log(company, `-> ${result.kind}:`, result.reason);
        continue;
      }
      const value = result.value;
      console.log(
        company,
        `-> QIB ${value.qibX}x, NII ${value.niiX}x, Retail ${value.retailX}x, EMP ${value.employeeX ?? "n/a"}, source ${value.sourceExchange}`,
      );
    } catch (e) {
      console.log(company, "-> ERROR:", (e as Error).message);
    }
  }
}

main();

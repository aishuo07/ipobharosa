import { fetchFinancialsFromSahi } from "../src/lib/financials/sahi";

async function main() {
  const companies = ["Technocraft Ventures Ltd", "Dhoot Transmission Ltd", "Molbio Diagnostics Ltd", "LEAP India Pvt Ltd"];
  for (const company of companies) {
    try {
      const years = await fetchFinancialsFromSahi(company);
      console.log(company, "->", JSON.stringify(years));
    } catch (e) {
      console.log(company, "-> ERROR:", (e as Error).message);
    }
  }
}
main();

import { fetchDocumentsFromIpowatch } from "../src/lib/documents/ipowatch";

async function main() {
  const companies = ["Dhoot Transmission Ltd", "Molbio Diagnostics Ltd", "LEAP India Pvt Ltd"];
  for (const company of companies) {
    try {
      const docs = await fetchDocumentsFromIpowatch(company);
      console.log(company, "->", docs.length, "docs:", docs.map((d) => d.label).join(", "));
    } catch (e) {
      console.log(company, "-> ERROR:", (e as Error).message);
    }
  }
}
main();

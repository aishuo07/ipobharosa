import { refreshCatalogue } from "./cache";

export async function refreshAllCatalogues(): Promise<void> {
  await refreshCatalogue();
}

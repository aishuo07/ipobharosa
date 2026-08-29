import { describe, expect, it } from "vitest";
import { catalogueContains, registrarCatalogueKey } from "./allotment-launch";

describe("registrarCatalogueKey", () => {
  it("maps KFinTech registrar names to the kfin catalogue", () => {
    expect(registrarCatalogueKey("KFin Technologies Ltd.")?.key).toBe("kfin");
    expect(registrarCatalogueKey("KFin Technologies Pvt. Ltd.")?.key).toBe("kfin");
  });

  it("maps Bigshare registrar names to the bigshare catalogue", () => {
    expect(registrarCatalogueKey("Bigshare Services Private Limited")?.key).toBe("bigshare");
  });

  it("maps MUFG and Link Intime names to the mufg catalogue", () => {
    expect(registrarCatalogueKey("MUFG Intime India Private Limited")?.key).toBe("mufg");
    expect(registrarCatalogueKey("Link Intime India Pvt. Ltd.")?.key).toBe("mufg");
  });

  it("returns null for unknown registrars", () => {
    expect(registrarCatalogueKey("Totally Unknown Registrar Ltd")).toBeNull();
    expect(registrarCatalogueKey(null)).toBeNull();
  });
});

describe("catalogueContains", () => {
  const catalogue = [
    { id: "86153103110", name: "SHIPROCKET LIMITED" },
    { id: "29849673370", name: "MILKY MIST DAIRY FOOD LIMITED" },
  ];

  it("matches an exact catalogue company name", () => {
    expect(catalogueContains(catalogue, "Shiprocket Limited")).toBe(true);
  });

  it("matches when the IPO uses a shorter display name", () => {
    expect(catalogueContains(catalogue, "Shiprocket")).toBe(true);
  });

  it("returns false when the company is not in the catalogue", () => {
    expect(catalogueContains(catalogue, "Not In Catalogue Limited")).toBe(false);
  });

  it("handles an empty catalogue", () => {
    expect(catalogueContains([], "Shiprocket Limited")).toBe(false);
  });
});
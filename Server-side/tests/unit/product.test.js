import { describe, it, expect } from "vitest";
import {
  generateProductArtNo,
  normalizeArtNo,
  normalizeSku,
  buildVariantSku,
  assignVariantSkus,
} from "../../Utils/product-identity";

describe("Product & SKU Identity Unit Tests", () => {
  it("should generate a valid Art No with SE prefix and year", () => {
    const artNo = generateProductArtNo();
    const currentYear = String(new Date().getFullYear()).slice(-2);

    expect(artNo.startsWith(`SE-${currentYear}`)).toBe(true);
    expect(artNo.length).toBe(11); // SE- + 2 digits + 6 random chars
  });

  it("should normalize art numbers cleanly", () => {
    expect(normalizeArtNo("  se-26-abc 123  ")).toBe("SE-26-ABC-123");
    expect(normalizeArtNo("se--26---xyz")).toBe("SE-26-XYZ");
    expect(normalizeArtNo("")).toBe("");
  });

  it("should build structured variant SKUs containing artNo, size, and color", () => {
    const artNo = "SE-26ABC123";
    const sku = buildVariantSku(artNo, "Large", "Red");

    expect(sku).toBe("SE-26ABC123-LARGE-RED");
  });

  it("should assign unique SKUs across multiple variants without duplicates", () => {
    const artNo = "SE-26XYZ890";
    const variants = [
      { size: "Medium", color: "Black" },
      { size: "Medium", color: "Black" }, // Duplicate size & color
      { size: "Large", color: "Black" },
    ];

    const result = assignVariantSkus(variants, artNo);

    expect(result.length).toBe(3);
    expect(result[0].sku).toBe("SE-26XYZ890-MEDIUM-BLA");
    expect(result[1].sku).toBe("SE-26XYZ890-MEDIUM-BLA-2"); // Automatically disambiguated!
    expect(result[2].sku).toBe("SE-26XYZ890-LARGE-BLA-3");
  });
});

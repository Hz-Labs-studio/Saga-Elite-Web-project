import { describe, it, expect } from "vitest";
import liveProductReducer, {
  normalizeLiveProductUpdate,
  applyLiveProductUpdate,
  receiveLiveProductUpdate,
} from "./live-product-slice";

describe("live-product-slice Unit Tests", () => {
  it("should normalize live product payload cleanly", () => {
    const raw = {
      _id: "prod-101",
      basePrice: "2999",
      discount: "10",
      drop: "drop-2026",
      slug: "rare-silk-shirt",
    };

    const normalized = normalizeLiveProductUpdate(raw);

    expect(normalized).toBeDefined();
    expect(normalized.productId).toBe("prod-101");
    expect(normalized.basePrice).toBe(2999);
    expect(normalized.discountPercent).toBe(10);
    expect(normalized.drop).toBe("drop-2026");
  });

  it("should return null when normalizing payload without an id", () => {
    expect(normalizeLiveProductUpdate({})).toBeNull();
  });

  it("should apply live price updates to a target product", () => {
    const original = {
      _id: "prod-101",
      name: "Atelier Silk Shirt",
      basePrice: 2500,
      discountPercent: 0,
      drop: "drop-2025",
    };

    const update = {
      productId: "prod-101",
      basePrice: 2200,
      discountPercent: 12,
      drop: "drop-2026",
    };

    const updated = applyLiveProductUpdate(original, update);

    expect(updated.basePrice).toBe(2200);
    expect(updated.discountPercent).toBe(12);
    expect(updated.drop).toBe("drop-2026");
    expect(updated.name).toBe("Atelier Silk Shirt");
  });

  it("should handle receiveLiveProductUpdate action in reducer", () => {
    const state = liveProductReducer(
      undefined,
      receiveLiveProductUpdate({ _id: "prod-1", basePrice: 4000 })
    );

    expect(state.byId["prod-1"]).toBeDefined();
    expect(state.byId["prod-1"].basePrice).toBe(4000);
  });
});

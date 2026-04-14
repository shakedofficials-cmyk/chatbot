import { beforeEach, describe, expect, it, vi } from "vitest";

const findCanonicalSynonym = vi.fn();

vi.mock("./synonyms.js", () => ({
  findCanonicalSynonym,
}));

describe("Query Understanding", () => {
  beforeEach(() => {
    findCanonicalSynonym.mockReset();
    findCanonicalSynonym.mockResolvedValue(null);
  });

  it("extracts availability intent with brand, model, and size", async () => {
    const { understandCatalogQuery } = await import("./query-understanding.js");

    findCanonicalSynonym.mockImplementation(async (_query: string, kind: string) => {
      if (kind === "model") return "dunk";
      return null;
    });

    const result = await understandCatalogQuery("do you have dunks size 44");

    expect(result.intent).toBe("size_lookup");
    expect(result.filters.brand).toBeUndefined();
    expect(result.filters.silhouette).toBe("dunk");
    expect(result.filters.size).toBe("44");
    expect(result.filters.inStock).toBe(true);
  });

  it("extracts recommendation-style signals and brand", async () => {
    const { understandCatalogQuery } = await import("./query-understanding.js");

    const result = await understandCatalogQuery("clean everyday adidas sneaker under 180");

    expect(result.intent).toBe("recommendations");
    expect(result.filters.brand).toBe("Adidas");
    expect(result.filters.category).toBe("sneaker");
    expect(result.filters.maxPrice).toBe(180);
    expect(result.entities.styleTerms).toEqual(expect.arrayContaining(["clean", "everyday"]));
  });

  it("routes policy and authenticity questions away from product search", async () => {
    const { understandCatalogQuery } = await import("./query-understanding.js");

    const authenticity = await understandCatalogQuery("are your products authentic?");
    const shipping = await understandCatalogQuery("how long does delivery take?");

    expect(authenticity.intent).toBe("authenticity");
    expect(shipping.intent).toBe("policy_support");
  });
});

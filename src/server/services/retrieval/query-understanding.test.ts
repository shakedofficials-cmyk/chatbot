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

  it("does not treat search command words as product models", async () => {
    const { understandCatalogQuery } = await import("./query-understanding.js");

    const result = await understandCatalogQuery("give me lifestyle size 44");

    expect(result.filters.category).toBe("lifestyle");
    expect(result.filters.size).toBe("44");
    expect(result.filters.model).toBeUndefined();
  });

  it("cleans filler language while preserving unknown model phrases", async () => {
    const { understandCatalogQuery } = await import("./query-understanding.js");

    const result = await understandCatalogQuery("am looking for a way of wade");

    expect(result.filters.model).toBe("way of wade");
    expect(result.entities.searchTerm).toBe("way of wade");
  });

  it("translates Franco-Arabic shopping terms into hard filters", async () => {
    const { understandCatalogQuery } = await import("./query-understanding.js");

    const result = await understandCatalogQuery("bade sobat a7mar la rfi2e size 44 football");

    expect(result.filters.color).toBe("red");
    expect(result.filters.category).toBe("football");
    expect(result.filters.size).toBe("44");
    expect(result.filters.inStock).toBe(true);
    expect(result.filters.model).toBeUndefined();
    expect(result.entities.searchTerm).toBe("football");
  });

  it("routes policy and authenticity questions away from product search", async () => {
    const { understandCatalogQuery } = await import("./query-understanding.js");

    const authenticity = await understandCatalogQuery("are your products authentic?");
    const shipping = await understandCatalogQuery("how long does delivery take?");

    expect(authenticity.intent).toBe("authenticity");
    expect(shipping.intent).toBe("policy_support");
  });
});

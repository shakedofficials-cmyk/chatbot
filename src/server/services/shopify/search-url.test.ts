import { describe, expect, it } from "vitest";
import type { Product, ProductVariant } from "../../../shared/types.js";
import { buildFilteredSearchUrl } from "./search-url.js";

function makeVariant(size: string, availableForSale = true): ProductVariant {
  return {
    id: `variant-${size}`,
    title: size,
    availableForSale,
    quantityAvailable: availableForSale ? 2 : 0,
    price: { amount: "180", currencyCode: "USD" },
    compareAtPrice: null,
    selectedOptions: [{ name: "Size", value: size }],
    image: null,
  };
}

function makeProduct(productType: string, variants: ProductVariant[]): Product {
  return {
    id: "product-1",
    handle: "adidas-ultraboost-5x",
    title: "adidas Ultraboost 5X",
    description: "",
    vendor: "Adidas",
    productType,
    tags: [],
    images: [],
    options: [{ name: "Size", values: variants.map((variant) => variant.title) }],
    variants,
    priceRange: {
      minVariantPrice: { amount: "180", currencyCode: "USD" },
      maxVariantPrice: { amount: "180", currencyCode: "USD" },
    },
    metafields: {},
  };
}

describe("buildFilteredSearchUrl", () => {
  it("uses matched product type and raw Shopify size facets for View all URLs", () => {
    const url = new URL(
      buildFilteredSearchUrl(
        "ultraboost",
        { model: "ultraboost", size: "39", inStock: true },
        [makeProduct("Running", [makeVariant("39 1/3"), makeVariant("40")])]
      )
    );

    expect(url.searchParams.get("q")).toBe("ultraboost");
    expect(url.searchParams.get("filter.v.availability")).toBe("1");
    expect(url.searchParams.get("filter.v.option.size")).toBe("39 1/3");
    expect(url.searchParams.get("filter.p.product_type")).toBe("Running");
    expect(url.searchParams.get("filter.p.m.custom.running_type")).toBe("Ultraboost");
    expect(url.searchParams.has("filter.p.m.custom.lifestyle_type")).toBe(false);
  });

  it("does not guess a model metafield when product type is unknown", () => {
    const url = new URL(
      buildFilteredSearchUrl("ultraboost", { model: "ultraboost", size: "39", inStock: true })
    );

    expect(url.searchParams.has("filter.p.m.custom.lifestyle_type")).toBe(false);
    expect(url.searchParams.get("filter.v.option.size")).toBe("39");
  });

  it("builds category-only lifestyle search links without command words", () => {
    const url = new URL(
      buildFilteredSearchUrl("lifestyle", { category: "lifestyle", size: "44", inStock: true })
    );

    expect(url.searchParams.get("q")).toBe("lifestyle");
    expect(url.searchParams.get("filter.v.option.size")).toBe("44");
    expect(url.searchParams.get("filter.p.product_type")).toBe("Lifestyle");
    expect(url.searchParams.has("filter.p.tag")).toBe(false);
    expect(url.searchParams.has("filter.p.m.custom.lifestyle_type")).toBe(false);
  });

  it("keeps football search links on football product type and color facets", () => {
    const url = new URL(
      buildFilteredSearchUrl("football", {
        category: "football",
        color: "red",
        size: "44",
        inStock: true,
      })
    );

    expect(url.searchParams.get("q")).toBe("football");
    expect(url.searchParams.get("filter.v.availability")).toBe("1");
    expect(url.searchParams.get("filter.v.option.size")).toBe("44");
    expect(url.searchParams.get("filter.p.m.custom.color")).toBe("Red");
    expect(url.searchParams.get("filter.p.product_type")).toBe("Football");
    expect(url.searchParams.has("filter.p.m.custom.lifestyle_type")).toBe(false);
    expect(url.searchParams.has("filter.p.m.custom.running_type")).toBe(false);
  });
});

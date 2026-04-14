import { describe, expect, it } from "vitest";
import type { Product } from "../../../shared/types.js";
import {
  enrichSearchWithContext,
  enrichSizeAvailabilityWithContext,
} from "./contextual-search.js";

function buildProduct(overrides: Partial<Product>): Product {
  return {
    id: overrides.id ?? "gid://shopify/Product/1",
    handle: overrides.handle ?? "adidas-samba-og",
    title: overrides.title ?? "Adidas Samba OG",
    description: overrides.description ?? "Classic low profile sneaker",
    vendor: overrides.vendor ?? "Adidas",
    productType: overrides.productType ?? "sneakers",
    tags: overrides.tags ?? ["retro", "daily"],
    images: overrides.images ?? [],
    options: overrides.options ?? [{ name: "Size", values: ["43", "44"] }],
    variants: overrides.variants ?? [
      {
        id: "gid://shopify/ProductVariant/1",
        title: "44",
        availableForSale: true,
        quantityAvailable: 2,
        price: { amount: "150.00", currencyCode: "USD" },
        compareAtPrice: null,
        selectedOptions: [{ name: "Size", value: "44" }],
        image: null,
      },
    ],
    priceRange: overrides.priceRange ?? {
      minVariantPrice: { amount: "150.00", currencyCode: "USD" },
      maxVariantPrice: { amount: "150.00", currencyCode: "USD" },
    },
    metafields: overrides.metafields ?? {},
  };
}

describe("contextual retrieval enrichment", () => {
  it("anchors cheaper follow-ups to the recent product category and price", () => {
    const recentProducts = [buildProduct({ title: "Nike Dunk Low", vendor: "Nike", handle: "nike-dunk-low" })];

    const result = enrichSearchWithContext({
      query: "something cheaper",
      filters: {},
      recentProducts,
      preferences: {},
    });

    expect(result.anchorProduct?.handle).toBe("nike-dunk-low");
    expect(result.filters.category).toBe("sneakers");
    expect(result.filters.maxPrice).toBe(149);
  });

  it("uses shopper preferences for vague short queries", () => {
    const result = enrichSearchWithContext({
      query: "show me",
      filters: {},
      recentProducts: [],
      preferences: {
        favoriteBrand: "New Balance",
        preferredColor: "grey",
      },
    });

    expect(result.filters.brand).toBe("New Balance");
  });

  it("resolves ordinal size follow-ups against recent products", () => {
    const recentProducts = [
      buildProduct({ handle: "adidas-samba-og" }),
      buildProduct({
        id: "gid://shopify/Product/2",
        handle: "nike-dunk-low",
        title: "Nike Dunk Low",
        vendor: "Nike",
      }),
    ];

    const result = enrichSizeAvailabilityWithContext({
      query: "what about the second one in 44",
      recentProducts,
    });

    expect(result.handleOrId).toBe("nike-dunk-low");
  });
});

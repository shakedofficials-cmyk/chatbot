import { describe, expect, it } from "vitest";
import type { Product, ProductVariant } from "../../../shared/types.js";
import { rankProductsForRevenue } from "./recommendations.js";

function variant(size: string, availableForSale = true, quantityAvailable = 4): ProductVariant {
  return {
    id: `variant-${size}`,
    title: size,
    availableForSale,
    quantityAvailable,
    price: { amount: "180", currencyCode: "USD" },
    compareAtPrice: null,
    selectedOptions: [{ name: "Size", value: size }],
    image: null,
  };
}

function product(input: {
  handle: string;
  title: string;
  productType: string;
  vendor?: string;
  variants: ProductVariant[];
  price?: string;
}): Product {
  return {
    id: input.handle,
    handle: input.handle,
    title: input.title,
    description: "",
    vendor: input.vendor ?? "Nike",
    productType: input.productType,
    tags: [],
    images: [],
    options: [{ name: "Size", values: input.variants.map((entry) => entry.title) }],
    variants: input.variants,
    priceRange: {
      minVariantPrice: { amount: input.price ?? "180", currencyCode: "USD" },
      maxVariantPrice: { amount: input.price ?? "180", currencyCode: "USD" },
    },
    metafields: {},
  };
}

describe("rankProductsForRevenue", () => {
  it("boosts exact size and requested product type", () => {
    const exact = product({
      handle: "lifestyle-exact",
      title: "Nike Air Force Black",
      productType: "Lifestyle",
      variants: [variant("44")],
    });
    const wrongType = product({
      handle: "running-exact",
      title: "Nike Pegasus Black",
      productType: "Running",
      variants: [variant("44")],
    });

    const result = rankProductsForRevenue([wrongType, exact], {
      category: "lifestyle",
      size: "44",
      color: "black",
      maxPrice: 200,
    });

    expect(result.products[0].handle).toBe("lifestyle-exact");
    expect(result.insights[0].badges).toEqual(expect.arrayContaining([
      "Size 44 in stock",
      "Best for daily",
      "Black match",
      "Under $200",
    ]));
  });

  it("marks low stock", () => {
    const result = rankProductsForRevenue([
      product({
        handle: "low-stock",
        title: "Nike Dunk",
        productType: "Lifestyle",
        variants: [variant("44", true, 1)],
      }),
    ], { size: "44" });

    expect(result.insights[0].badges).toContain("Low stock");
  });
});

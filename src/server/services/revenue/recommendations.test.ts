import { describe, expect, it } from "vitest";
import type { Product, ProductVariant } from "../../../shared/types.js";
import { productMatchesRequestedColor, rankProductsForRevenue } from "./recommendations.js";

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
      "Size 44 ready",
      "Lifestyle",
      "Black match",
      "Best under $200",
    ]));
  });

  it("boosts products that fit the anonymous shopper profile", () => {
    const puma = product({
      handle: "puma-runner",
      title: "PUMA Runner",
      productType: "Running",
      vendor: "PUMA",
      variants: [variant("44")],
    });
    const nike = product({
      handle: "nike-lifestyle",
      title: "Nike Air Force Black",
      productType: "Lifestyle",
      vendor: "Nike",
      variants: [variant("44")],
    });

    const result = rankProductsForRevenue([puma, nike], { size: "44" }, {
      favoriteBrands: ["Nike"],
      preferredCategories: ["Lifestyle"],
      preferredColors: ["black"],
    });

    expect(result.products[0].handle).toBe("nike-lifestyle");
    expect(result.insights[0].badges).toContain("Fits your profile");
    expect(result.insights[0].score).toBeGreaterThan(0);
    expect(result.insights[0].matchReasons).toContain("Fits your profile");
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

  it("does not treat embedded letters as a color match", () => {
    const predator = product({
      handle: "predator-white",
      title: "adidas Predator League FT FG",
      productType: "Football",
      variants: [variant("44")],
    });
    const redBoot = product({
      handle: "predator-red",
      title: "adidas Predator Club FG",
      productType: "Football",
      variants: [variant("44")],
    });
    redBoot.images = [{ url: "https://cdn.shopify.com/JS0349_Red_White.jpg", altText: null }];

    expect(productMatchesRequestedColor(predator, "red")).toBe(false);
    expect(productMatchesRequestedColor(redBoot, "red")).toBe(true);
  });
});

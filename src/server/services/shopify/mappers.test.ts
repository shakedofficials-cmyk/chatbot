import { describe, it, expect } from "vitest";
import { mapProduct, mapCart } from "./mappers.js";

describe("Shopify Mappers", () => {
  describe("mapProduct", () => {
    it("maps a raw Storefront product to Product type", () => {
      const raw = {
        id: "gid://shopify/Product/1",
        handle: "adidas-samba-og",
        title: "Adidas Samba OG",
        description: "Classic sneaker",
        vendor: "Adidas",
        productType: "Sneakers",
        tags: ["sneakers", "classic"],
        images: {
          edges: [{ node: { url: "https://img.test/1.jpg", altText: "Samba", width: 800, height: 800 } }],
        },
        options: [{ name: "Size", values: ["42", "43", "44"] }],
        variants: {
          edges: [
            {
              node: {
                id: "gid://shopify/ProductVariant/1",
                title: "42",
                availableForSale: true,
                quantityAvailable: 5,
                price: { amount: "120.00", currencyCode: "USD" },
                compareAtPrice: null,
                selectedOptions: [{ name: "Size", value: "42" }],
                image: null,
              },
            },
          ],
        },
        priceRange: {
          minVariantPrice: { amount: "120.00", currencyCode: "USD" },
          maxVariantPrice: { amount: "120.00", currencyCode: "USD" },
        },
        fitProfile: { value: "True to size" },
        materialSummary: { value: "Leather upper" },
      };

      const product = mapProduct(raw);

      expect(product.handle).toBe("adidas-samba-og");
      expect(product.title).toBe("Adidas Samba OG");
      expect(product.vendor).toBe("Adidas");
      expect(product.images).toHaveLength(1);
      expect(product.variants).toHaveLength(1);
      expect(product.variants[0].availableForSale).toBe(true);
      expect(product.metafields.fitProfile).toBe("True to size");
      expect(product.metafields.materialSummary).toBe("Leather upper");
    });

    it("handles missing metafields gracefully", () => {
      const raw = {
        id: "gid://shopify/Product/2",
        handle: "test",
        title: "Test",
        description: "",
        vendor: "Test",
        productType: "",
        tags: [],
        images: { edges: [] },
        options: [],
        variants: { edges: [] },
        priceRange: {
          minVariantPrice: { amount: "0", currencyCode: "USD" },
          maxVariantPrice: { amount: "0", currencyCode: "USD" },
        },
      };

      const product = mapProduct(raw);
      expect(product.metafields).toEqual({});
    });
  });

  describe("mapCart", () => {
    it("maps a raw Storefront cart", () => {
      const raw = {
        id: "gid://shopify/Cart/1",
        checkoutUrl: "https://shop.test/checkout",
        totalQuantity: 2,
        lines: {
          edges: [
            {
              node: {
                id: "line-1",
                quantity: 2,
                merchandise: {
                  id: "gid://shopify/ProductVariant/1",
                  title: "42",
                  product: { title: "Samba OG", handle: "samba-og" },
                  image: null,
                  price: { amount: "120.00", currencyCode: "USD" },
                  selectedOptions: [{ name: "Size", value: "42" }],
                },
              },
            },
          ],
        },
        cost: {
          totalAmount: { amount: "240.00", currencyCode: "USD" },
          subtotalAmount: { amount: "240.00", currencyCode: "USD" },
        },
      };

      const cart = mapCart(raw);
      expect(cart.id).toBe("gid://shopify/Cart/1");
      expect(cart.totalQuantity).toBe(2);
      expect(cart.lines).toHaveLength(1);
      expect(cart.lines[0].quantity).toBe(2);
    });
  });
});

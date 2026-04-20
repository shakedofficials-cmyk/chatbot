import { describe, expect, it } from "vitest";
import { localCartAddLines, localCartCreate } from "./local-cart.js";

describe("localCart checkout URLs", () => {
  it("builds a cart permalink for a single item instead of redirecting to a product page", () => {
    const cart = localCartCreate();
    const updated = localCartAddLines(cart.id, "gid://shopify/ProductVariant/48196688412904", 1, {
      productHandle: "hq2037-101",
      productTitle: "Nike Dunk Low",
      variantTitle: "44",
      price: { amount: "100.00", currencyCode: "USD" },
    });

    expect(updated.checkoutUrl).toContain("/cart/48196688412904:1");
    expect(updated.checkoutUrl).not.toContain("/products/");
  });
});

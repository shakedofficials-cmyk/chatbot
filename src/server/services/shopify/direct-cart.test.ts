import { describe, expect, it, vi } from "vitest";
import { addVariantToCart } from "./direct-cart.js";
import type { Cart } from "../../../shared/types.js";

function makeCart(id: string, checkoutUrl = `https://checkout.test/${id}`): Cart {
  return {
    id,
    checkoutUrl,
    totalQuantity: 1,
    lines: [],
    cost: {
      totalAmount: { amount: "100.00", currencyCode: "USD" },
      subtotalAmount: { amount: "100.00", currencyCode: "USD" },
    },
  };
}

describe("addVariantToCart", () => {
  it("reuses an existing Shopify cart when cartId is present", async () => {
    const cartAddLines = vi.fn().mockResolvedValue(makeCart("existing-cart"));
    const cartCreateWithLine = vi.fn();

    const result = await addVariantToCart(
      {
        cartId: "existing-cart",
        variantId: "gid://shopify/ProductVariant/1",
      },
      {
        hasLiveStore: true,
        cartAddLines,
        cartCreateWithLine,
        localCartCreate: vi.fn(),
        localCartAddLines: vi.fn(),
      }
    );

    expect(cartAddLines).toHaveBeenCalledWith("existing-cart", "gid://shopify/ProductVariant/1", 1);
    expect(cartCreateWithLine).not.toHaveBeenCalled();
    expect(result.provider).toBe("shopify");
    expect(result.reusedExistingCart).toBe(true);
    expect(result.cart.id).toBe("existing-cart");
  });

  it("creates a fresh Shopify cart when the existing cart add fails", async () => {
    const cartAddLines = vi.fn().mockRejectedValue(new Error("cart expired"));
    const cartCreateWithLine = vi.fn().mockResolvedValue(makeCart("fresh-cart"));

    const result = await addVariantToCart(
      {
        cartId: "expired-cart",
        variantId: "gid://shopify/ProductVariant/2",
      },
      {
        hasLiveStore: true,
        cartAddLines,
        cartCreateWithLine,
        localCartCreate: vi.fn(),
        localCartAddLines: vi.fn(),
      }
    );

    expect(cartAddLines).toHaveBeenCalledTimes(1);
    expect(cartCreateWithLine).toHaveBeenCalledWith("gid://shopify/ProductVariant/2", 1);
    expect(result.provider).toBe("shopify");
    expect(result.reusedExistingCart).toBe(false);
    expect(result.cart.id).toBe("fresh-cart");
  });

  it("falls back to the local cart when Shopify cart operations fail", async () => {
    const localCartCreate = vi.fn().mockReturnValue(makeCart("local-cart"));
    const localCartAddLines = vi.fn().mockReturnValue(makeCart("local-cart"));

    const result = await addVariantToCart(
      {
        variantId: "gid://shopify/ProductVariant/3",
        productHandle: "air-force-1",
      },
      {
        hasLiveStore: true,
        cartAddLines: vi.fn(),
        cartCreateWithLine: vi.fn().mockRejectedValue(new Error("shopify down")),
        localCartCreate,
        localCartAddLines,
      }
    );

    expect(localCartCreate).toHaveBeenCalledTimes(1);
    expect(localCartAddLines).toHaveBeenCalledWith(
      "local-cart",
      "gid://shopify/ProductVariant/3",
      1,
      expect.objectContaining({ productHandle: "air-force-1" })
    );
    expect(result.provider).toBe("local");
    expect(result.cart.id).toBe("local-cart");
  });

  it("keeps reusing a local fallback cart on subsequent adds", async () => {
    const localCartAddLines = vi.fn().mockReturnValue(makeCart("cart_123"));

    const result = await addVariantToCart(
      {
        cartId: "cart_123",
        variantId: "gid://shopify/ProductVariant/4",
      },
      {
        hasLiveStore: true,
        cartAddLines: vi.fn(),
        cartCreateWithLine: vi.fn(),
        localCartCreate: vi.fn(),
        localCartAddLines,
      }
    );

    expect(localCartAddLines).toHaveBeenCalledWith(
      "cart_123",
      "gid://shopify/ProductVariant/4",
      1,
      expect.any(Object)
    );
    expect(result.provider).toBe("local");
    expect(result.reusedExistingCart).toBe(true);
  });
});

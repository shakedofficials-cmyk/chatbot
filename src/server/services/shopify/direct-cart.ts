import { hasLiveShopifyStore } from "../../config.js";
import { cartAddLines, cartCreateWithLine } from "./storefront.js";
import { localCartAddLines, localCartCreate } from "./local-cart.js";
import type { Cart, Money } from "../../../shared/types.js";

export interface DirectCartInput {
  variantId: string;
  quantity?: number;
  cartId?: string;
  variantTitle?: string;
  productTitle?: string;
  productHandle?: string;
  price?: Money;
}

export interface DirectCartResult {
  cart: Cart;
  provider: "shopify" | "local";
  reusedExistingCart: boolean;
}

interface DirectCartDependencies {
  hasLiveStore: boolean;
  cartCreateWithLine: (variantId: string, quantity: number) => Promise<Cart>;
  cartAddLines: (cartId: string, variantId: string, quantity: number) => Promise<Cart>;
  localCartCreate: () => Cart;
  localCartAddLines: (
    cartId: string,
    variantId: string,
    quantity: number,
    meta: {
      variantTitle?: string;
      productTitle?: string;
      productHandle?: string;
      price?: Money;
    }
  ) => Cart;
}

const defaultDependencies: DirectCartDependencies = {
  hasLiveStore: hasLiveShopifyStore,
  cartCreateWithLine,
  cartAddLines,
  localCartCreate,
  localCartAddLines,
};

function isLocalCartId(cartId: string | undefined): boolean {
  return Boolean(cartId?.startsWith("cart_"));
}

export async function addVariantToCart(
  input: DirectCartInput,
  deps: DirectCartDependencies = defaultDependencies
): Promise<DirectCartResult> {
  const quantity = input.quantity ?? 1;

  if (isLocalCartId(input.cartId)) {
    const cart = deps.localCartAddLines(input.cartId!, input.variantId, quantity, {
      variantTitle: input.variantTitle,
      productTitle: input.productTitle,
      productHandle: input.productHandle,
      price: input.price,
    });

    return {
      cart,
      provider: "local",
      reusedExistingCart: true,
    };
  }

  if (deps.hasLiveStore) {
    if (input.cartId) {
      try {
        const cart = await deps.cartAddLines(input.cartId, input.variantId, quantity);
        return { cart, provider: "shopify", reusedExistingCart: true };
      } catch (error) {
        console.warn("[cart] existing Shopify cart add failed, creating a fresh cart", {
          cartId: input.cartId,
          variantId: input.variantId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    try {
      const cart = await deps.cartCreateWithLine(input.variantId, quantity);
      return { cart, provider: "shopify", reusedExistingCart: false };
    } catch (error) {
      console.error("[cart] Shopify cart flow failed, falling back to local cart", {
        variantId: input.variantId,
        cartId: input.cartId ?? null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  let resolvedCartId = input.cartId;
  if (!resolvedCartId) {
    const newCart = deps.localCartCreate();
    resolvedCartId = newCart.id;
  }

  const cart = deps.localCartAddLines(resolvedCartId, input.variantId, quantity, {
    variantTitle: input.variantTitle,
    productTitle: input.productTitle,
    productHandle: input.productHandle,
    price: input.price,
  });

  return {
    cart,
    provider: "local",
    reusedExistingCart: Boolean(input.cartId),
  };
}

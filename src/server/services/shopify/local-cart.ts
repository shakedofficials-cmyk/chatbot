import { env } from "../../config.js";
import type { Cart, CartLine, Money } from "../../../shared/types.js";

interface LocalCartItem {
  lineId: string;
  variantId: string;
  quantity: number;
  variantTitle: string;
  productTitle: string;
  productHandle: string;
  price: Money;
}

interface LocalCart {
  id: string;
  items: LocalCartItem[];
}

const carts = new Map<string, LocalCart>();

function extractNumericId(gid: string): string {
  const parts = gid.split("/");
  return parts[parts.length - 1];
}

function buildCheckoutUrl(cart: LocalCart): string {
  const domain = env.SHOPIFY_STORE_DOMAIN ?? "orjn.myshopify.com";
  if (cart.items.length === 0) {
    return `https://${domain}/cart`;
  }
  // For a single item with a known handle, land on the product page with the
  // variant pre-selected. This is more reliable than /cart/ permalinks which
  // fail when Shopify can't match the variant ID (e.g. stale GID numeric part).
  if (cart.items.length === 1 && cart.items[0].productHandle) {
    const item = cart.items[0];
    const numericId = extractNumericId(item.variantId);
    return `https://${domain}/products/${item.productHandle}?variant=${numericId}`;
  }
  const lineItems = cart.items
    .map((item) => `${extractNumericId(item.variantId)}:${item.quantity}`)
    .join(",");
  return `https://${domain}/cart/${lineItems}`;
}

function calcTotal(items: LocalCartItem[]): Money {
  const total = items.reduce((sum, item) => {
    return sum + parseFloat(item.price.amount) * item.quantity;
  }, 0);
  const currency = items[0]?.price.currencyCode ?? "USD";
  return { amount: total.toFixed(2), currencyCode: currency };
}

function toPublicCart(cart: LocalCart): Cart {
  const totalAmount = calcTotal(cart.items);
  const lines: CartLine[] = cart.items.map((item) => ({
    id: item.lineId,
    quantity: item.quantity,
    merchandise: {
      id: item.variantId,
      title: item.variantTitle,
      product: {
        title: item.productTitle,
        handle: item.productHandle,
      },
      image: null,
      price: item.price,
      selectedOptions: [],
    },
  }));

  return {
    id: cart.id,
    checkoutUrl: buildCheckoutUrl(cart),
    totalQuantity: cart.items.reduce((sum, item) => sum + item.quantity, 0),
    lines,
    cost: {
      totalAmount,
      subtotalAmount: totalAmount,
    },
  };
}

export function localCartCreate(): Cart {
  const id = `cart_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const cart: LocalCart = { id, items: [] };
  carts.set(id, cart);
  return toPublicCart(cart);
}

export function localCartAddLines(
  cartId: string,
  variantId: string,
  quantity: number,
  meta: { variantTitle?: string; productTitle?: string; productHandle?: string; price?: Money } = {}
): Cart {
  let cart = carts.get(cartId);
  if (!cart) {
    cart = { id: cartId, items: [] };
    carts.set(cartId, cart);
  }

  const existing = cart.items.find((item) => item.variantId === variantId);
  if (existing) {
    existing.quantity += quantity;
  } else {
    cart.items.push({
      lineId: `line_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      variantId,
      quantity,
      variantTitle: meta.variantTitle ?? variantId,
      productTitle: meta.productTitle ?? "",
      productHandle: meta.productHandle ?? "",
      price: meta.price ?? { amount: "0.00", currencyCode: "USD" },
    });
  }

  return toPublicCart(cart);
}

export function localCartUpdateLines(
  cartId: string,
  lineId: string,
  quantity: number
): Cart {
  const cart = carts.get(cartId);
  if (!cart) throw new Error(`Cart not found: ${cartId}`);

  if (quantity <= 0) {
    cart.items = cart.items.filter((item) => item.lineId !== lineId);
  } else {
    const item = cart.items.find((item) => item.lineId === lineId);
    if (item) item.quantity = quantity;
  }

  return toPublicCart(cart);
}

export function localCartGet(cartId: string): Cart {
  const cart = carts.get(cartId);
  if (!cart) throw new Error(`Cart not found: ${cartId}`);
  return toPublicCart(cart);
}

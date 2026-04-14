import type { Product, ProductComparison, CartAction, CartLine } from "../../../shared/types.js";
import { MOCK_PRODUCTS } from "../shopify/mock-data.js";
import { answerPolicyQuestion } from "../knowledge/index.js";
import { logEvent } from "../analytics/index.js";
import { nanoid } from "nanoid";

interface OrchestratorResult {
  reply: string;
  products: Product[];
  comparison: ProductComparison | null;
  cartAction: CartAction | null;
  cartId: string | null;
}

// In-memory mock cart
const mockCarts = new Map<string, { id: string; checkoutUrl: string; lines: CartLine[] }>();

export async function devOrchestrate(
  userMessage: string,
  _conversationHistory: { role: string; content: string }[],
  sessionId: string,
  cartId: string | null
): Promise<OrchestratorResult> {
  const msg = userMessage.toLowerCase();

  // ── Policy questions ──
  const policyKeywords = ["shipping", "return", "exchange", "refund", "authentic", "real", "fake", "size guide", "sizing", "care", "clean", "contact", "support", "whatsapp", "payment", "pay", "cash"];
  if (policyKeywords.some((kw) => msg.includes(kw))) {
    const result = answerPolicyQuestion(userMessage);
    await logEvent(sessionId, "policy_question", { question: userMessage });
    return {
      reply: result.answer,
      products: [],
      comparison: null,
      cartAction: null,
      cartId,
    };
  }

  // ── Compare ──
  if (msg.includes("compare")) {
    const products = MOCK_PRODUCTS.slice(0, 2);
    await logEvent(sessionId, "comparison_requested", { products: products.map((p) => p.handle) });

    const comparison: ProductComparison = {
      products,
      comparison: {
        prices: products.map((p) => ({
          handle: p.handle,
          price: `${p.priceRange.minVariantPrice.amount} ${p.priceRange.minVariantPrice.currencyCode}`,
          compareAtPrice: p.variants[0]?.compareAtPrice ? `${p.variants[0].compareAtPrice.amount} ${p.variants[0].compareAtPrice.currencyCode}` : null,
        })),
        availableSizes: products.map((p) => ({
          handle: p.handle,
          sizes: p.variants.filter((v) => v.availableForSale).flatMap((v) => v.selectedOptions.filter((o) => o.name === "Size").map((o) => o.value)),
        })),
        brands: products.map((p) => ({ handle: p.handle, brand: p.vendor })),
        productTypes: products.map((p) => ({ handle: p.handle, type: p.productType })),
        materials: products.map((p) => ({ handle: p.handle, material: p.metafields.materialSummary ?? null })),
        recommendations: "Both are solid daily options. The Samba has a slimmer profile and leather build, while the AF1 is chunkier with more cushioning.",
      },
    };

    return {
      reply: `Here's a side-by-side comparison of the **${products[0].title}** and **${products[1].title}**. The Samba is the sharper choice if you want something slim and versatile. The AF1 is the move if you want classic bulk and comfort.`,
      products,
      comparison,
      cartAction: null,
      cartId,
    };
  }

  // ── Checkout ──
  if (msg.includes("checkout")) {
    const currentCart = cartId ? mockCarts.get(cartId) : null;
    if (currentCart && currentCart.lines.length > 0) {
      await logEvent(sessionId, "checkout_started", {});
      return {
        reply: "You're all set. Here's your checkout link.",
        products: [],
        comparison: null,
        cartAction: { type: "checkout", checkoutUrl: currentCart.checkoutUrl },
        cartId,
      };
    }
    return {
      reply: "Your cart is empty — find something you like first, then I'll take you to checkout.",
      products: [],
      comparison: null,
      cartAction: null,
      cartId,
    };
  }

  // ── Add to cart ──
  if (msg.includes("add") && msg.includes("cart")) {
    // Find which product they might mean
    const matchedProduct = MOCK_PRODUCTS.find((p) =>
      msg.includes(p.title.toLowerCase()) || msg.includes(p.vendor.toLowerCase())
    ) ?? MOCK_PRODUCTS[0];

    // Try to extract size
    const sizeMatch = msg.match(/size\s*(\d{2})/);
    const requestedSize = sizeMatch ? sizeMatch[1] : null;

    const variant = requestedSize
      ? matchedProduct.variants.find((v) => v.selectedOptions.some((o) => o.value === requestedSize))
      : matchedProduct.variants.find((v) => v.availableForSale);

    if (!variant) {
      const availableSizes = matchedProduct.variants.filter((v) => v.availableForSale).map((v) => v.selectedOptions.find((o) => o.name === "Size")?.value).filter(Boolean);
      return {
        reply: `That size isn't available for the ${matchedProduct.title}. Available sizes: ${availableSizes.join(", ")}. Which one do you want?`,
        products: [matchedProduct],
        comparison: null,
        cartAction: null,
        cartId,
      };
    }

    if (!variant.availableForSale) {
      const availableSizes = matchedProduct.variants.filter((v) => v.availableForSale).map((v) => v.selectedOptions.find((o) => o.name === "Size")?.value).filter(Boolean);
      return {
        reply: `Size ${requestedSize} is out of stock for the ${matchedProduct.title}. Still available: ${availableSizes.join(", ")}.`,
        products: [matchedProduct],
        comparison: null,
        cartAction: null,
        cartId,
      };
    }

    // Create cart if needed
    let currentCartId = cartId;
    if (!currentCartId) {
      currentCartId = `mock-cart-${nanoid(8)}`;
      mockCarts.set(currentCartId, { id: currentCartId, checkoutUrl: `https://demo.myshopify.com/checkout/${currentCartId}`, lines: [] });
    }

    const cart = mockCarts.get(currentCartId)!;
    const sizeLabel = variant.selectedOptions.find((o) => o.name === "Size")?.value ?? variant.title;

    cart.lines.push({
      id: `line-${nanoid(6)}`,
      quantity: 1,
      merchandise: {
        id: variant.id,
        title: variant.title,
        product: { title: matchedProduct.title, handle: matchedProduct.handle },
        image: matchedProduct.images[0] ?? null,
        price: variant.price,
        selectedOptions: variant.selectedOptions,
      },
    });

    await logEvent(sessionId, "add_to_cart", { product: matchedProduct.handle, variant: variant.id, size: sizeLabel });

    return {
      reply: `Added **${matchedProduct.title}** (size ${sizeLabel}) to your cart. ${variant.price.currencyCode} ${variant.price.amount}. Want to keep shopping or head to checkout?`,
      products: [],
      comparison: null,
      cartAction: { type: "add", variantId: variant.id, quantity: 1, productTitle: matchedProduct.title },
      cartId: currentCartId,
    };
  }

  // ── Size / availability check ──
  if (msg.includes("size") || msg.includes("available") || msg.includes("stock")) {
    const matchedProduct = MOCK_PRODUCTS.find((p) =>
      msg.includes(p.title.toLowerCase()) || msg.includes(p.vendor.toLowerCase()) || msg.includes(p.handle)
    ) ?? MOCK_PRODUCTS[0];

    await logEvent(sessionId, "size_availability_requested", { product: matchedProduct.handle });

    const sizeMatch = msg.match(/size\s*(\d{2})/);
    if (sizeMatch) {
      const size = sizeMatch[1];
      const variant = matchedProduct.variants.find((v) => v.selectedOptions.some((o) => o.value === size));
      if (!variant) {
        return { reply: `Size ${size} doesn't exist for the ${matchedProduct.title}.`, products: [matchedProduct], comparison: null, cartAction: null, cartId };
      }
      if (variant.availableForSale) {
        return { reply: `Yes, size ${size} is in stock for the **${matchedProduct.title}** — ${variant.quantityAvailable} left. ${variant.price.currencyCode} ${variant.price.amount}. Want me to add it to your cart?`, products: [matchedProduct], comparison: null, cartAction: null, cartId };
      }
      const alternatives = matchedProduct.variants.filter((v) => v.availableForSale).map((v) => v.selectedOptions.find((o) => o.name === "Size")?.value).filter(Boolean);
      return { reply: `Size ${size} is sold out for the ${matchedProduct.title}. Still available: ${alternatives.join(", ")}.`, products: [matchedProduct], comparison: null, cartAction: null, cartId };
    }

    const available = matchedProduct.variants.filter((v) => v.availableForSale).map((v) => v.selectedOptions.find((o) => o.name === "Size")?.value).filter(Boolean);
    const outOfStock = matchedProduct.variants.filter((v) => !v.availableForSale).map((v) => v.selectedOptions.find((o) => o.name === "Size")?.value).filter(Boolean);
    return {
      reply: `**${matchedProduct.title}** — available sizes: ${available.join(", ")}${outOfStock.length > 0 ? `. Sold out: ${outOfStock.join(", ")}` : ""}. Want me to add one to your cart?`,
      products: [matchedProduct],
      comparison: null,
      cartAction: null,
      cartId,
    };
  }

  // ── Product search (default) ──
  const searchTerms = msg.split(/\s+/);
  let results = MOCK_PRODUCTS.filter((p) => {
    const haystack = `${p.title} ${p.vendor} ${p.productType} ${p.tags.join(" ")} ${p.description}`.toLowerCase();
    return searchTerms.some((term) => term.length > 2 && haystack.includes(term));
  });

  if (results.length === 0) results = MOCK_PRODUCTS.slice(0, 3);

  // Price filter
  const priceMatch = msg.match(/under\s*\$?(\d+)/);
  if (priceMatch) {
    const maxPrice = parseInt(priceMatch[1]);
    results = results.filter((p) => parseFloat(p.priceRange.minVariantPrice.amount) <= maxPrice);
  }

  await logEvent(sessionId, "product_search", { query: userMessage, resultCount: results.length });

  if (results.length === 0) {
    await logEvent(sessionId, "no_result", { query: userMessage });
    return {
      reply: "Nothing matching that in stock right now. Want to try a different search?",
      products: [],
      comparison: null,
      cartAction: null,
      cartId,
    };
  }

  const displayProducts = results.slice(0, 4);
  const intro = results.length === 1
    ? `Here's what I found — the **${results[0].title}**.`
    : `Found ${results.length} option${results.length > 1 ? "s" : ""} for you. Here are the top picks.`;

  return {
    reply: intro,
    products: displayProducts,
    comparison: null,
    cartAction: null,
    cartId,
  };
}

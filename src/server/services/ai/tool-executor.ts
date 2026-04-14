import type { Product, ProductComparison, Cart, SearchFilters } from "../../../shared/types.js";
import * as shopify from "../shopify/storefront.js";
import * as dbProducts from "../products/db-products.js";
import { answerPolicyQuestion } from "../knowledge/index.js";
import { logEvent } from "../analytics/index.js";

export interface ToolResult {
  content: string;
  products?: Product[];
  comparison?: ProductComparison;
  cart?: Cart;
  checkoutUrl?: string;
}

export async function executeTool(
  toolName: string,
  input: Record<string, any>,
  sessionId: string
): Promise<ToolResult> {
  switch (toolName) {
    case "search_products":
      return handleSearchProducts(input, sessionId);
    case "get_product":
      return handleGetProduct(input);
    case "get_variant_by_options":
      return handleGetVariantByOptions(input);
    case "get_variant_availability":
      return handleGetVariantAvailability(input);
    case "compare_products":
      return handleCompareProducts(input, sessionId);
    case "cart_create":
      return handleCartCreate();
    case "cart_add_lines":
      return handleCartAddLines(input);
    case "cart_update_lines":
      return handleCartUpdateLines(input);
    case "get_cart":
      return handleGetCart(input);
    case "get_checkout_url":
      return handleGetCheckoutUrl(input);
    case "answer_policy_question":
      return handleAnswerPolicyQuestion(input, sessionId);
    case "log_event":
      return handleLogEvent(input, sessionId);
    default:
      return { content: `Unknown tool: ${toolName}` };
  }
}

async function handleSearchProducts(
  input: Record<string, any>,
  sessionId: string
): Promise<ToolResult> {
  const filters: SearchFilters = {
    brand: input.brand,
    minPrice: input.min_price,
    maxPrice: input.max_price,
    category: input.category,
    color: input.color,
    productType: input.product_type,
    inStock: input.in_stock,
  };

  const products = await dbProducts.searchProducts(input.query, filters);

  await logEvent(sessionId, "product_search", { query: input.query, resultCount: products.length });

  if (products.length === 0) {
    await logEvent(sessionId, "no_result", { query: input.query });
    return {
      content: "No products found matching your search.",
      products: [],
    };
  }

  return {
    content: `Found ${products.length} product(s).`,
    products,
  };
}

async function handleGetProduct(input: Record<string, any>): Promise<ToolResult> {
  const handleOrId = input.handle_or_id;
  const product = handleOrId.startsWith("gid://")
    ? await dbProducts.getProductById(handleOrId)
    : await dbProducts.getProductByHandle(handleOrId);

  if (!product) {
    return { content: `Product not found: ${handleOrId}` };
  }

  return {
    content: JSON.stringify(product),
    products: [product],
  };
}

async function handleGetVariantByOptions(input: Record<string, any>): Promise<ToolResult> {
  const { product, variant } = await dbProducts.getVariantByOptions(
    input.handle_or_id,
    input.selected_options
  );

  if (!variant) {
    const availableOptions = product.variants
      .filter((v) => v.availableForSale)
      .map((v) => v.selectedOptions.map((o) => `${o.name}: ${o.value}`).join(", "))
      .slice(0, 5);

    return {
      content: `That exact variant isn't available. Available options: ${availableOptions.join(" | ") || "none in stock"}`,
      products: [product],
    };
  }

  return {
    content: JSON.stringify({
      variantId: variant.id,
      title: variant.title,
      price: variant.price,
      compareAtPrice: variant.compareAtPrice,
      available: variant.availableForSale,
      quantityAvailable: variant.quantityAvailable,
      selectedOptions: variant.selectedOptions,
    }),
    products: [product],
  };
}

async function handleGetVariantAvailability(input: Record<string, any>): Promise<ToolResult> {
  const result = await dbProducts.getVariantAvailability(input.variant_id, input.handle_or_id);

  return {
    content: JSON.stringify({
      available: result.available,
      quantityAvailable: result.quantityAvailable,
      variant: result.variant
        ? {
            title: result.variant.title,
            price: result.variant.price,
            selectedOptions: result.variant.selectedOptions,
          }
        : null,
    }),
  };
}

async function handleCompareProducts(
  input: Record<string, any>,
  sessionId: string
): Promise<ToolResult> {
  const ids: string[] = input.product_ids;

  // Resolve products — handles or GIDs
  const products: Product[] = [];
  for (const id of ids) {
    const product = id.startsWith("gid://")
      ? await dbProducts.getProductById(id)
      : await dbProducts.getProductByHandle(id);
    if (product) products.push(product);
  }

  if (products.length < 2) {
    return { content: "Need at least 2 valid products to compare." };
  }

  await logEvent(sessionId, "comparison_requested", {
    products: products.map((p) => p.handle),
  });

  const comparison: ProductComparison = {
    products,
    comparison: {
      prices: products.map((p) => ({
        handle: p.handle,
        price: `${p.priceRange.minVariantPrice.amount} ${p.priceRange.minVariantPrice.currencyCode}`,
        compareAtPrice: p.variants[0]?.compareAtPrice
          ? `${p.variants[0].compareAtPrice.amount} ${p.variants[0].compareAtPrice.currencyCode}`
          : null,
      })),
      availableSizes: products.map((p) => ({
        handle: p.handle,
        sizes: p.variants
          .filter((v) => v.availableForSale)
          .flatMap((v) => v.selectedOptions.filter((o) => o.name.toLowerCase() === "size").map((o) => o.value))
          .filter((v, i, a) => a.indexOf(v) === i),
      })),
      brands: products.map((p) => ({ handle: p.handle, brand: p.vendor })),
      productTypes: products.map((p) => ({ handle: p.handle, type: p.productType })),
      materials: products.map((p) => ({
        handle: p.handle,
        material: p.metafields.materialSummary ?? null,
      })),
      recommendations: "", // AI will generate this
    },
  };

  return {
    content: JSON.stringify(comparison.comparison),
    comparison,
    products,
  };
}

async function handleCartCreate(): Promise<ToolResult> {
  const cart = await shopify.cartCreate();
  return {
    content: JSON.stringify({ cartId: cart.id, checkoutUrl: cart.checkoutUrl }),
    cart,
  };
}

async function handleCartAddLines(input: Record<string, any>): Promise<ToolResult> {
  const cart = await shopify.cartAddLines(
    input.cart_id,
    input.variant_id,
    input.quantity ?? 1
  );
  return {
    content: `Added to cart. Cart now has ${cart.totalQuantity} item(s). Total: ${cart.cost.totalAmount.amount} ${cart.cost.totalAmount.currencyCode}`,
    cart,
  };
}

async function handleCartUpdateLines(input: Record<string, any>): Promise<ToolResult> {
  const cart = await shopify.cartUpdateLines(
    input.cart_id,
    input.line_id,
    input.quantity
  );
  return {
    content: `Cart updated. ${cart.totalQuantity} item(s). Total: ${cart.cost.totalAmount.amount} ${cart.cost.totalAmount.currencyCode}`,
    cart,
  };
}

async function handleGetCart(input: Record<string, any>): Promise<ToolResult> {
  const cart = await shopify.cartGet(input.cart_id);
  return {
    content: JSON.stringify(cart),
    cart,
  };
}

async function handleGetCheckoutUrl(input: Record<string, any>): Promise<ToolResult> {
  const cart = await shopify.cartGet(input.cart_id);
  return {
    content: cart.checkoutUrl,
    checkoutUrl: cart.checkoutUrl,
    cart,
  };
}

async function handleAnswerPolicyQuestion(
  input: Record<string, any>,
  sessionId: string
): Promise<ToolResult> {
  const result = answerPolicyQuestion(input.question);
  await logEvent(sessionId, "policy_question", { question: input.question, topic: result.topic });
  return { content: result.answer };
}

async function handleLogEvent(
  input: Record<string, any>,
  sessionId: string
): Promise<ToolResult> {
  await logEvent(sessionId, input.event_name, input.payload ?? {});
  return { content: "Event logged." };
}

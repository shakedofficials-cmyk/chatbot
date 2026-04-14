import type { Cart, Product, ProductComparison, SearchFilters, ShopperPreferences } from "../../../shared/types.js";
import * as shopify from "../shopify/storefront.js";
import * as dbProducts from "../products/db-products.js";
import { answerPolicyQuestion } from "../knowledge/index.js";
import { logEvent } from "../analytics/index.js";
import {
  enrichSearchWithContext,
  enrichSizeAvailabilityWithContext,
} from "../retrieval/contextual-search.js";

export interface ToolResult {
  content: string;
  products?: Product[];
  comparison?: ProductComparison;
  cart?: Cart;
  checkoutUrl?: string;
}

export interface ToolExecutionContext {
  recentProductHandles?: string[];
  preferences?: Record<string, unknown>;
}

export async function executeTool(
  toolName: string,
  input: Record<string, any>,
  sessionId: string,
  context: ToolExecutionContext = {}
): Promise<ToolResult> {
  switch (toolName) {
    case "search_products":
      return handleSearchProducts(input, sessionId, context);
    case "get_product":
      return handleGetProduct(input);
    case "get_size_availability":
      return handleGetSizeAvailability(input, sessionId, context);
    case "find_similar_products":
      return handleFindSimilarProducts(input, sessionId, context);
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
    case "get_policy":
    case "answer_policy_question":
      return handleGetPolicy(input, sessionId);
    case "log_event":
      return handleLogEvent(input, sessionId);
    default:
      return { content: `Unknown tool: ${toolName}` };
  }
}

async function handleSearchProducts(
  input: Record<string, any>,
  sessionId: string,
  context: ToolExecutionContext
): Promise<ToolResult> {
  const filters: SearchFilters = {
    brand: input.brand,
    model: input.model,
    minPrice: input.min_price,
    maxPrice: input.max_price,
    category: input.category,
    color: input.color,
    size: input.size,
    productType: input.product_type,
    inStock: input.in_stock,
  };

  const recentProducts = context.recentProductHandles?.length
    ? await dbProducts.getProductsByHandles(context.recentProductHandles.slice(-4))
    : [];
  const enriched = enrichSearchWithContext({
    query: input.query,
    filters,
    recentProducts,
    preferences: (context.preferences ?? {}) as ShopperPreferences,
  });

  const products = await dbProducts.searchProducts(enriched.query, enriched.filters, 8, sessionId);

  await logEvent(sessionId, "product_search", {
    query: input.query,
    effectiveFilters: enriched.filters,
    contextReasoning: enriched.reasoning,
    resultCount: products.length,
  });

  if (products.length === 0) {
    await logEvent(sessionId, "no_result", {
      query: input.query,
      effectiveFilters: enriched.filters,
      contextReasoning: enriched.reasoning,
    });
    return {
      content: "No strong catalog matches found.",
      products: [],
    };
  }

  return {
    content: `Retrieved ${products.length} grounded catalog match(es).`,
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

async function handleGetSizeAvailability(
  input: Record<string, any>,
  sessionId: string,
  context: ToolExecutionContext
): Promise<ToolResult> {
  const recentProducts = context.recentProductHandles?.length
    ? await dbProducts.getProductsByHandles(context.recentProductHandles.slice(-4))
    : [];
  const enriched = enrichSizeAvailabilityWithContext({
    query: input.query,
    handleOrId: input.handle_or_id,
    recentProducts,
  });

  const result = await dbProducts.getSizeAvailability(
    {
      query: enriched.query,
      handleOrId: enriched.handleOrId,
      size: String(input.size),
    },
    sessionId
  );

  await logEvent(sessionId, "size_availability_requested", {
    query: input.query ?? input.handle_or_id,
    effectiveHandle: enriched.handleOrId,
    size: input.size,
    foundProduct: Boolean(result.product),
    inStock: Boolean(result.matchingVariant),
  });

  if (!result.product) {
    return {
      content: `No exact product match found for size ${input.size}.`,
      products: result.alternatives,
    };
  }

  if (!result.matchingVariant) {
    return {
      content: JSON.stringify({
        available: false,
        requestedSize: String(input.size),
        productHandle: result.product.handle,
      }),
      products: [result.product, ...result.alternatives].slice(0, 4),
    };
  }

  return {
    content: JSON.stringify({
      available: true,
      requestedSize: String(input.size),
      variantId: result.matchingVariant.id,
      price: result.matchingVariant.price,
      productHandle: result.product.handle,
    }),
    products: [result.product],
  };
}

async function handleFindSimilarProducts(
  input: Record<string, any>,
  sessionId: string,
  context: ToolExecutionContext
): Promise<ToolResult> {
  const recentHandle = context.recentProductHandles?.slice(-1)[0];
  const products = await dbProducts.findSimilarProducts(
    input.handle_or_id ?? recentHandle ?? "",
    input.query,
    sessionId
  );

  if (products.length === 0) {
    return { content: "No similar products found.", products: [] };
  }

  return {
    content: `Found ${products.length} similar product option(s).`,
    products,
  };
}

async function handleGetVariantByOptions(input: Record<string, any>): Promise<ToolResult> {
  const { product, variant } = await dbProducts.getVariantByOptions(
    input.handle_or_id,
    input.selected_options
  );

  if (!variant) {
    const availableOptions = product.variants
      .filter((entry) => entry.availableForSale)
      .map((entry) => entry.selectedOptions.map((option) => `${option.name}: ${option.value}`).join(", "))
      .slice(0, 5);

    return {
      content: `That exact variant is not available. Available options: ${availableOptions.join(" | ") || "none in stock"}`,
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
    products: products.map((product) => product.handle),
  });

  const comparison: ProductComparison = {
    products,
    comparison: {
      prices: products.map((product) => ({
        handle: product.handle,
        price: `${product.priceRange.minVariantPrice.amount} ${product.priceRange.minVariantPrice.currencyCode}`,
        compareAtPrice: product.variants[0]?.compareAtPrice
          ? `${product.variants[0].compareAtPrice.amount} ${product.variants[0].compareAtPrice.currencyCode}`
          : null,
      })),
      availableSizes: products.map((product) => ({
        handle: product.handle,
        sizes: product.variants
          .filter((variant) => variant.availableForSale)
          .flatMap((variant) =>
            variant.selectedOptions
              .filter((option) => option.name.toLowerCase() === "size")
              .map((option) => option.value)
          )
          .filter((value, index, all) => all.indexOf(value) === index),
      })),
      brands: products.map((product) => ({ handle: product.handle, brand: product.vendor })),
      productTypes: products.map((product) => ({ handle: product.handle, type: product.productType })),
      materials: products.map((product) => ({
        handle: product.handle,
        material: product.metafields.materialSummary ?? null,
      })),
      recommendations: "",
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
  const cart = await shopify.cartAddLines(input.cart_id, input.variant_id, input.quantity ?? 1);
  return {
    content: `Added to cart. Cart now has ${cart.totalQuantity} item(s).`,
    cart,
  };
}

async function handleCartUpdateLines(input: Record<string, any>): Promise<ToolResult> {
  const cart = await shopify.cartUpdateLines(input.cart_id, input.line_id, input.quantity);
  return {
    content: `Cart updated. ${cart.totalQuantity} item(s).`,
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

async function handleGetPolicy(
  input: Record<string, any>,
  sessionId: string
): Promise<ToolResult> {
  const result = answerPolicyQuestion(input.question);
  await logEvent(sessionId, "policy_question", {
    question: input.question,
    topic: result.topic,
  });
  return { content: result.answer };
}

async function handleLogEvent(
  input: Record<string, any>,
  sessionId: string
): Promise<ToolResult> {
  await logEvent(sessionId, input.event_name, input.payload ?? {});
  return { content: "Event logged." };
}

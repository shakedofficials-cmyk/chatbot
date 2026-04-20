import type { Cart, Product, ProductComparison, SearchFilters, ShopperPreferences } from "../../../shared/types.js";
import * as shopify from "../shopify/storefront.js";
import * as dbProducts from "../products/db-products.js";
import {
  localCartCreate,
  localCartAddLines,
  localCartUpdateLines,
  localCartGet,
} from "../shopify/local-cart.js";
import { answerPolicyQuestion } from "../knowledge/index.js";
import { logEvent } from "../analytics/index.js";
import {
  enrichSearchWithContext,
  enrichSizeAvailabilityWithContext,
} from "../retrieval/contextual-search.js";
import {
  findBestVariantMatch,
  findSizeOptionValue,
  normalizeVariantSize,
} from "../size-resolution.js";

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
      return handleGetVariantByOptions(input, context);
    case "get_variant_availability":
      return handleGetVariantAvailability(input, context);
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
    tags: input.tags,
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

  // ── No specific size requested → return full size matrix ──
  if (!input.size) {
    let product: Product | null = null;
    if (enriched.handleOrId) {
      product = enriched.handleOrId.startsWith("gid://")
        ? await dbProducts.getProductById(enriched.handleOrId)
        : await dbProducts.getProductByHandle(enriched.handleOrId);
    } else if (enriched.query) {
      const products = await dbProducts.searchProducts(enriched.query, {}, 1, sessionId);
      product = products[0] ?? null;
    }

    if (!product) {
      return { content: JSON.stringify({ found: false, message: "Product not found." }) };
    }

    const allSizes = product.variants.map((v) => {
      const raw = findSizeOptionValue(v.selectedOptions);
      const normalized = raw ? (normalizeVariantSize(raw)?.value ?? raw) : v.title;
      return { size: normalized, available: v.availableForSale };
    });
    const availableSizes = allSizes.filter((s) => s.available).map((s) => s.size);
    const unavailableSizes = allSizes.filter((s) => !s.available).map((s) => s.size);

    return {
      content: JSON.stringify({
        productHandle: product.handle,
        productTitle: product.title,
        available_sizes: availableSizes,
        unavailable_sizes: unavailableSizes,
        total_variants: product.variants.length,
        in_stock_count: availableSizes.length,
        message: availableSizes.length > 0
          ? `In stock: ${availableSizes.join(", ")}`
          : "No sizes currently in stock.",
      }),
      products: [product],
    };
  }

  // ── Specific size check ──
  const result = await dbProducts.getSizeAvailability(
    { query: enriched.query, handleOrId: enriched.handleOrId, size: String(input.size) },
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
      content: JSON.stringify({
        found: false,
        has_requested_size: false,
        available_sizes: [],
        closest_sizes: [],
        message: `No product match found for size ${input.size}.`,
      }),
      products: result.alternatives,
    };
  }

  const matchResult = findBestVariantMatch(result.product.variants, String(input.size));
  const closestSizes = matchResult.closestMatches.map((v) => {
    const raw = findSizeOptionValue(v.selectedOptions);
    return raw ? (normalizeVariantSize(raw)?.value ?? raw) : v.title;
  });

  if (!result.matchingVariant) {
    return {
      content: JSON.stringify({
        available: false,
        has_requested_size: false,
        requestedSize: String(input.size),
        productHandle: result.product.handle,
        available_sizes: matchResult.availableSizes,
        closest_sizes: closestSizes,
        message: `Size ${input.size} not available for ${result.product.title}. In stock: ${matchResult.availableSizes.join(", ") || "none"}.`,
      }),
      products: [result.product],
    };
  }

  return {
    content: JSON.stringify({
      available: true,
      has_requested_size: true,
      requestedSize: String(input.size),
      variantId: result.matchingVariant.id,
      price: result.matchingVariant.price,
      productHandle: result.product.handle,
      productTitle: result.product.title,
      available_sizes: matchResult.availableSizes,
      closest_sizes: [],
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

async function handleGetVariantByOptions(
  input: Record<string, any>,
  context: ToolExecutionContext
): Promise<ToolResult> {
  // Build an ordered list of candidate handles: the explicit one first, then recent context.
  const candidates: string[] = [];
  if (input.handle_or_id) candidates.push(String(input.handle_or_id));
  for (const handle of (context.recentProductHandles ?? []).slice().reverse()) {
    if (!candidates.includes(handle)) candidates.push(handle);
  }

  let product: Product | null = null;
  let variant: Product["variants"][0] | null = null;
  for (const handle of candidates) {
    const result = await dbProducts.getVariantByOptions(handle, input.selected_options ?? {});
    if (result.product) {
      product = result.product;
      variant = result.variant;
      break;
    }
  }

  // Identify the size input (if any) to build a rich size context
  const sizeKey = Object.keys(input.selected_options ?? {}).find((k) =>
    k.toLowerCase().includes("size")
  );
  const sizeInput: string | undefined = sizeKey
    ? String(input.selected_options[sizeKey])
    : undefined;

  if (!product) {
    return {
      content: JSON.stringify({
        found: false,
        has_requested_size: false,
        available_sizes: [],
        closest_sizes: [],
        message: `Couldn't resolve the product. Call search_products with the product name first, then retry with handle_or_id.`,
      }),
    };
  }

  const matchResult = sizeInput
    ? findBestVariantMatch(product.variants, sizeInput)
    : null;

  const availableSizes = matchResult?.availableSizes ?? [];
  const closestSizes = (matchResult?.closestMatches ?? []).map((v) => {
    const raw = findSizeOptionValue(v.selectedOptions);
    return raw ? (normalizeVariantSize(raw)?.value ?? raw) : v.title;
  });

  if (!variant) {
    return {
      content: JSON.stringify({
        found: false,
        has_requested_size: false,
        available_sizes: availableSizes,
        closest_sizes: closestSizes,
        message: sizeInput
          ? `Size ${sizeInput} not in stock. Closest available: ${closestSizes.join(", ") || "none"}.`
          : `Variant not available. In-stock options: ${
              product.variants
                .filter((v) => v.availableForSale)
                .map((v) => v.selectedOptions.map((o) => `${o.name}: ${o.value}`).join(", "))
                .slice(0, 5)
                .join(" | ") || "none"
            }`,
      }),
      products: [product],
    };
  }

  return {
    content: JSON.stringify({
      found: true,
      variantId: variant.id,
      title: variant.title,
      price: variant.price,
      compareAtPrice: variant.compareAtPrice,
      available: variant.availableForSale,
      quantityAvailable: variant.quantityAvailable,
      selectedOptions: variant.selectedOptions,
      has_requested_size: true,
      available_sizes: availableSizes,
      closest_sizes: [],
    }),
    products: [product],
  };
}

async function handleGetVariantAvailability(
  input: Record<string, any>,
  context: ToolExecutionContext
): Promise<ToolResult> {
  const handleCandidates: string[] = [];
  if (input.handle_or_id) handleCandidates.push(String(input.handle_or_id));
  for (const handle of (context.recentProductHandles ?? []).slice().reverse()) {
    if (!handleCandidates.includes(handle)) handleCandidates.push(handle);
  }

  let product: Product | null = null;
  let resolvedHandle: string | null = null;
  for (const handle of handleCandidates) {
    const loaded = handle.startsWith("gid://")
      ? await dbProducts.getProductById(handle)
      : await dbProducts.getProductByHandle(handle);
    if (loaded) {
      product = loaded;
      resolvedHandle = handle;
      break;
    }
  }

  if (!product || !resolvedHandle) {
    return {
      content: JSON.stringify({
        available: false,
        has_requested_size: false,
        message: "Product context missing. Call search_products first.",
      }),
    };
  }

  const result = await dbProducts.getVariantAvailability(input.variant_id, resolvedHandle);

  const sizeRaw = result.variant
    ? findSizeOptionValue(result.variant.selectedOptions)
    : null;

  const matchResult =
    product && sizeRaw ? findBestVariantMatch(product.variants, sizeRaw) : null;

  const closestSizes = result.available
    ? []
    : (matchResult?.closestMatches ?? []).map((v) => {
        const raw = findSizeOptionValue(v.selectedOptions);
        return raw ? (normalizeVariantSize(raw)?.value ?? raw) : v.title;
      });

  return {
    content: JSON.stringify({
      available: result.available,
      quantityAvailable: result.quantityAvailable,
      has_requested_size: result.available,
      available_sizes: matchResult?.availableSizes ?? [],
      closest_sizes: closestSizes,
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
  const cart = localCartCreate();
  return {
    content: JSON.stringify({ cartId: cart.id, checkoutUrl: cart.checkoutUrl }),
    cart,
  };
}

async function handleCartAddLines(input: Record<string, any>): Promise<ToolResult> {
  const cart = localCartAddLines(input.cart_id, input.variant_id, input.quantity ?? 1);
  return {
    content: `Added to cart. Cart now has ${cart.totalQuantity} item(s). Checkout: ${cart.checkoutUrl}`,
    cart,
  };
}

async function handleCartUpdateLines(input: Record<string, any>): Promise<ToolResult> {
  const cart = localCartUpdateLines(input.cart_id, input.line_id, input.quantity);
  return {
    content: `Cart updated. ${cart.totalQuantity} item(s).`,
    cart,
  };
}

async function handleGetCart(input: Record<string, any>): Promise<ToolResult> {
  const cart = localCartGet(input.cart_id);
  return {
    content: JSON.stringify({ totalQuantity: cart.totalQuantity, checkoutUrl: cart.checkoutUrl, lines: cart.lines.length }),
    cart,
  };
}

async function handleGetCheckoutUrl(input: Record<string, any>): Promise<ToolResult> {
  const cart = localCartGet(input.cart_id);
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

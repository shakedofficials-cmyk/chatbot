import type { Product, Cart, SearchFilters } from "../../../shared/types.js";
import { storefrontQuery } from "./client.js";
import {
  SEARCH_PRODUCTS,
  GET_PRODUCT_BY_HANDLE,
  GET_PRODUCT_BY_ID,
  GET_PRODUCTS_BY_IDS,
  CART_CREATE,
  CART_CREATE_WITH_LINE,
  CART_ADD_LINES,
  CART_UPDATE_LINES,
  CART_GET,
} from "./queries.js";
import { mapProduct, mapCart } from "./mappers.js";

// ── Product search ──

export async function searchProducts(
  query: string,
  filters: SearchFilters = {},
  first = 10
): Promise<Product[]> {
  // Build a Shopify search query string from natural language + filters
  const parts: string[] = [query];

  if (filters.brand) parts.push(`vendor:${filters.brand}`);
  if (filters.productType) parts.push(`product_type:${filters.productType}`);
  if (filters.category) parts.push(filters.category);
  if (filters.color) parts.push(filters.color);

  const searchQuery = parts.join(" ");

  const data = await storefrontQuery<any>(SEARCH_PRODUCTS, {
    query: searchQuery,
    first,
  });

  let products: Product[] = (data.search?.edges ?? [])
    .map((e: any) => e.node)
    .filter(Boolean)
    .map(mapProduct);

  // Apply client-side filters that Storefront search doesn't natively support
  if (filters.minPrice != null) {
    products = products.filter(
      (p) => parseFloat(p.priceRange.minVariantPrice.amount) >= filters.minPrice!
    );
  }
  if (filters.maxPrice != null) {
    products = products.filter(
      (p) => parseFloat(p.priceRange.minVariantPrice.amount) <= filters.maxPrice!
    );
  }
  if (filters.inStock) {
    products = products.filter((p) => p.variants.some((v) => v.availableForSale));
  }

  return products;
}

// ── Single product ──

export async function getProductByHandle(handle: string): Promise<Product | null> {
  const data = await storefrontQuery<any>(GET_PRODUCT_BY_HANDLE, { handle });
  return data.product ? mapProduct(data.product) : null;
}

export async function getProductById(id: string): Promise<Product | null> {
  const data = await storefrontQuery<any>(GET_PRODUCT_BY_ID, { id });
  return data.product ? mapProduct(data.product) : null;
}

// ── Variant resolution ──

export async function getVariantByOptions(
  handleOrId: string,
  selectedOptions: Record<string, string>
): Promise<{ product: Product; variant: Product["variants"][0] | null }> {
  const product = handleOrId.startsWith("gid://")
    ? await getProductById(handleOrId)
    : await getProductByHandle(handleOrId);

  if (!product) throw new Error(`Product not found: ${handleOrId}`);

  const variant = product.variants.find((v) =>
    Object.entries(selectedOptions).every(([name, value]) =>
      v.selectedOptions.some(
        (o) => o.name.toLowerCase() === name.toLowerCase() && o.value.toLowerCase() === value.toLowerCase()
      )
    )
  ) ?? null;

  return { product, variant };
}

// ── Variant availability ──

export async function getVariantAvailability(
  variantId: string,
  handleOrId: string
): Promise<{
  available: boolean;
  quantityAvailable: number | null;
  variant: Product["variants"][0] | null;
}> {
  const product = handleOrId.startsWith("gid://")
    ? await getProductById(handleOrId)
    : await getProductByHandle(handleOrId);

  if (!product) throw new Error(`Product not found: ${handleOrId}`);

  const variant = product.variants.find((v) => v.id === variantId) ?? null;

  return {
    available: variant?.availableForSale ?? false,
    quantityAvailable: variant?.quantityAvailable ?? null,
    variant,
  };
}

// ── Compare products ──

export async function getProductsByIds(ids: string[]): Promise<Product[]> {
  const data = await storefrontQuery<any>(GET_PRODUCTS_BY_IDS, { ids });
  return (data.nodes ?? []).filter(Boolean).map(mapProduct);
}

// ── Cart operations ──

export async function cartCreate(): Promise<Cart> {
  const data = await storefrontQuery<any>(CART_CREATE);
  if (data.cartCreate.userErrors?.length) {
    throw new Error(data.cartCreate.userErrors.map((e: any) => e.message).join(", "));
  }
  return mapCart(data.cartCreate.cart);
}

export async function cartCreateWithLine(variantId: string, quantity = 1): Promise<Cart> {
  const data = await storefrontQuery<any>(CART_CREATE_WITH_LINE, { variantId, quantity });
  if (data.cartCreate.userErrors?.length) {
    throw new Error(data.cartCreate.userErrors.map((e: any) => e.message).join(", "));
  }
  return mapCart(data.cartCreate.cart);
}

export async function cartAddLines(
  cartId: string,
  variantId: string,
  quantity: number
): Promise<Cart> {
  const data = await storefrontQuery<any>(CART_ADD_LINES, {
    cartId,
    lines: [{ merchandiseId: variantId, quantity }],
  });
  if (data.cartLinesAdd.userErrors?.length) {
    throw new Error(data.cartLinesAdd.userErrors.map((e: any) => e.message).join(", "));
  }
  return mapCart(data.cartLinesAdd.cart);
}

export async function cartUpdateLines(
  cartId: string,
  lineId: string,
  quantity: number
): Promise<Cart> {
  const data = await storefrontQuery<any>(CART_UPDATE_LINES, {
    cartId,
    lines: [{ id: lineId, quantity }],
  });
  if (data.cartLinesUpdate.userErrors?.length) {
    throw new Error(data.cartLinesUpdate.userErrors.map((e: any) => e.message).join(", "));
  }
  return mapCart(data.cartLinesUpdate.cart);
}

export async function cartGet(cartId: string): Promise<Cart> {
  const data = await storefrontQuery<any>(CART_GET, { cartId });
  return mapCart(data.cart);
}

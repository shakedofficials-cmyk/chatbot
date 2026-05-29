import type { Product, ProductImage, ProductOption, ProductVariant, SearchFilters } from "../../../shared/types.js";
import { buildFilteredSearchUrl, getPublicStoreBaseUrl } from "./search-url.js";

interface ShopifyProductJson {
  id: number | string;
  handle: string;
  title: string;
  description?: string;
  vendor?: string;
  type?: string;
  tags?: string[];
  images?: string[];
  featured_image?: string;
  options?: ProductOption[];
  variants?: Array<{
    id: number | string;
    title: string;
    available: boolean;
    price: number;
    compare_at_price?: number | null;
    featured_image?: { src?: string; alt?: string | null; width?: number; height?: number } | null;
    option1?: string | null;
    option2?: string | null;
    option3?: string | null;
    options?: string[];
  }>;
}

type RawVariant = NonNullable<ShopifyProductJson["variants"]>[number];

function moneyFromCents(cents: number | null | undefined) {
  return {
    amount: ((cents ?? 0) / 100).toFixed(2).replace(/\.00$/, ""),
    currencyCode: "USD",
  };
}

function absoluteUrl(value: string | undefined): string {
  if (!value) return "";
  if (value.startsWith("//")) return `https:${value}`;
  if (value.startsWith("/")) return `${getPublicStoreBaseUrl()}${value}`;
  return value;
}

function extractHandles(html: string, limit: number): string[] {
  const handles = new Set<string>();
  const markerIndex = html.indexOf("productVariants");
  const resultSection = markerIndex >= 0
    ? html.slice(markerIndex, markerIndex + 250_000)
    : html;
  const normalizedSection = resultSection
    .replace(/\\u0026/g, "&")
    .replace(/\\\//g, "/")
    .replace(/\\"/g, "\"");
  const patterns = [
    /"url":"\/products\/([a-z0-9][a-z0-9-]*)/gi,
    /"url":"https?:\/\/[^/]+\/products\/([a-z0-9][a-z0-9-]*)/gi,
  ];

  for (const pattern of patterns) {
    for (const match of normalizedSection.matchAll(pattern)) {
      handles.add(match[1]);
      if (handles.size >= limit) return Array.from(handles);
    }
  }

  if (handles.size > 0) return Array.from(handles);

  for (const match of normalizedSection.matchAll(/\/products\/([a-z0-9][a-z0-9-]*)/gi)) {
    handles.add(match[1]);
    if (handles.size >= limit) break;
  }

  return Array.from(handles);
}

function mapVariant(raw: RawVariant, options: ProductOption[]): ProductVariant {
  const selectedOptions = options
    .map((option, index) => {
      const value = raw.options?.[index] ?? raw[`option${index + 1}` as "option1" | "option2" | "option3"];
      return value ? { name: option.name, value } : null;
    })
    .filter((entry): entry is { name: string; value: string } => Boolean(entry));

  return {
    id: `gid://shopify/ProductVariant/${raw.id}`,
    title: raw.title,
    availableForSale: raw.available,
    quantityAvailable: null,
    price: moneyFromCents(raw.price),
    compareAtPrice: raw.compare_at_price ? moneyFromCents(raw.compare_at_price) : null,
    selectedOptions,
    image: raw.featured_image?.src
      ? {
          url: absoluteUrl(raw.featured_image.src),
          altText: raw.featured_image.alt ?? null,
          width: raw.featured_image.width,
          height: raw.featured_image.height,
        }
      : null,
  };
}

function mapPublicProduct(raw: ShopifyProductJson): Product {
  const options = raw.options ?? [];
  const variants = (raw.variants ?? []).map((variant) => mapVariant(variant, options));
  const prices = variants.map((variant) => Number(variant.price.amount)).filter(Number.isFinite);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 0;
  const imageUrls = raw.images?.length ? raw.images : raw.featured_image ? [raw.featured_image] : [];
  const images: ProductImage[] = imageUrls.map((url) => ({
    url: absoluteUrl(url),
    altText: raw.title,
  }));

  return {
    id: `gid://shopify/Product/${raw.id}`,
    handle: raw.handle,
    title: raw.title,
    description: raw.description?.replace(/<[^>]*>/g, "") ?? "",
    vendor: raw.vendor ?? "",
    productType: raw.type ?? "",
    tags: raw.tags ?? [],
    images,
    options,
    variants,
    priceRange: {
      minVariantPrice: { amount: minPrice.toFixed(2).replace(/\.00$/, ""), currencyCode: "USD" },
      maxVariantPrice: { amount: maxPrice.toFixed(2).replace(/\.00$/, ""), currencyCode: "USD" },
    },
    metafields: {},
  };
}

async function fetchPublicProduct(handle: string): Promise<Product | null> {
  const response = await fetch(`${getPublicStoreBaseUrl()}/products/${handle}.js`);
  if (!response.ok) return null;
  return mapPublicProduct((await response.json()) as ShopifyProductJson);
}

export async function searchPublicFilteredProducts(
  query: string,
  filters: SearchFilters,
  limit = 8
): Promise<Product[]> {
  const response = await fetch(buildFilteredSearchUrl(query, filters));
  if (!response.ok) return [];

  const handles = extractHandles(await response.text(), limit * 2);
  const products = await Promise.all(handles.map((handle) => fetchPublicProduct(handle)));
  return products
    .filter((product): product is Product => Boolean(product))
    .filter((product) => {
      if (!filters.size) return true;
      return product.variants.some((variant) => {
        const hasSize = variant.selectedOptions.some(
          (option) =>
            option.name.toLowerCase().includes("size") &&
            option.value.toLowerCase() === filters.size?.toLowerCase()
        );
        return hasSize && (!filters.inStock || variant.availableForSale);
      });
    })
    .slice(0, limit);
}

import { env } from "../../config.js";
import type { Product, SearchFilters } from "../../../shared/types.js";
import { normalizeText } from "../retrieval/normalize.js";
import { findBestVariantMatch, findSizeOptionValue } from "../size-resolution.js";

const GENERIC_CATEGORIES = new Set(["shoe", "shoes", "sneaker", "sneakers"]);

export function getPublicStoreBaseUrl(): string {
  const configured = env.SHOPIFY_PUBLIC_STORE_URL.trim();
  const base = configured || `https://${env.SHOPIFY_STORE_DOMAIN}`;
  return base.replace(/\/+$/, "");
}

function toFilterValue(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function inferProductType(products: Product[]): string | undefined {
  return products.find((product) => {
    const productType = normalizeText(product.productType);
    return productType && !GENERIC_CATEGORIES.has(productType);
  })?.productType;
}

function categoryKey(value: string | undefined): string {
  const normalized = normalizeText(value);
  if (normalized.includes("basket")) return "basketball";
  if (normalized.includes("football") || normalized.includes("soccer")) return "football";
  if (normalized.includes("running") || normalized.includes("run")) return "running";
  if (normalized.includes("training") || normalized.includes("train")) return "training";
  if (normalized.includes("lifestyle") || normalized.includes("life style")) return "lifestyle";
  return normalized;
}

function typeFilterKey(category: string): string | undefined {
  if (category === "basketball") return "basketball_type";
  if (category === "running") return "running_type";
  if (category === "training") return "training_type";
  if (category === "lifestyle") return "lifestyle_type";
  return undefined;
}

function resolveStorefrontSizeFilter(size: string | undefined, products: Product[]): string | undefined {
  if (!size) return undefined;

  for (const product of products) {
    const match = findBestVariantMatch(product.variants, size);
    const variant = match.exactMatchAvailable ?? match.exactMatch;
    if (!variant) continue;

    const rawSize = findSizeOptionValue(variant.selectedOptions);
    if (rawSize) return rawSize;
  }

  return size;
}

function enrichFiltersForUrl(filters: SearchFilters, products: Product[]): SearchFilters {
  if (products.length === 0) return filters;

  const enriched: SearchFilters = { ...filters };
  const currentCategory = categoryKey(enriched.productType ?? enriched.category);
  const productType = inferProductType(products);

  if (
    productType &&
    (!currentCategory || GENERIC_CATEGORIES.has(currentCategory)) &&
    (enriched.model || enriched.silhouette)
  ) {
    enriched.productType = productType;
    enriched.category = productType;
  }

  enriched.size = resolveStorefrontSizeFilter(enriched.size, products);

  return enriched;
}

export function buildFilteredSearchUrl(
  searchTerm: string,
  filters: SearchFilters,
  products: Product[] = []
): string {
  const effectiveFilters = enrichFiltersForUrl(filters, products);
  const url = new URL(`${getPublicStoreBaseUrl()}/search`);
  const normalizedTerm = searchTerm.trim();
  if (normalizedTerm) {
    url.searchParams.set("q", normalizedTerm);
  }
  url.searchParams.set("options[prefix]", "last");

  if (effectiveFilters.inStock || effectiveFilters.size) {
    url.searchParams.set("filter.v.availability", "1");
  }
  if (effectiveFilters.size) {
    url.searchParams.set("filter.v.option.size", effectiveFilters.size);
  }
  if (effectiveFilters.color) {
    url.searchParams.set("filter.p.m.custom.color", toFilterValue(effectiveFilters.color));
  }
  if (effectiveFilters.minPrice != null) {
    url.searchParams.set("filter.v.price.gte", String(effectiveFilters.minPrice));
  }
  if (effectiveFilters.maxPrice != null) {
    url.searchParams.set("filter.v.price.lte", String(effectiveFilters.maxPrice));
  }

  const categorySource = effectiveFilters.productType ?? effectiveFilters.category;
  const category = categoryKey(categorySource);
  if (category && !GENERIC_CATEGORIES.has(category)) {
    url.searchParams.set("filter.p.product_type", toFilterValue(categorySource ?? category));
  }

  if (effectiveFilters.brand) {
    url.searchParams.set("filter.p.vendor", toFilterValue(effectiveFilters.brand));
  }

  const typeMetafield = effectiveFilters.silhouette ?? effectiveFilters.model;
  const typeMetafieldKey = typeFilterKey(category);
  if (
    typeMetafield &&
    category &&
    typeMetafieldKey &&
    !GENERIC_CATEGORIES.has(category) &&
    normalizeText(typeMetafield) !== category
  ) {
    url.searchParams.set(`filter.p.m.custom.${typeMetafieldKey}`, toFilterValue(typeMetafield));
  }

  const gender = effectiveFilters.gender ?? (
    effectiveFilters.tags && ["men", "women", "kids"].includes(normalizeText(effectiveFilters.tags))
      ? effectiveFilters.tags
      : undefined
  );
  if (gender) {
    url.searchParams.set("filter.p.m.custom.gender", toFilterValue(gender));
  }

  return url.toString();
}

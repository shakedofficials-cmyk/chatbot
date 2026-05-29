import { env } from "../../config.js";
import type { SearchFilters } from "../../../shared/types.js";
import { normalizeText } from "../retrieval/normalize.js";

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

function appendTag(url: URL, tag: string | undefined): void {
  if (!tag) return;
  url.searchParams.append("filter.p.tag", normalizeText(tag));
}

export function buildFilteredSearchUrl(searchTerm: string, filters: SearchFilters): string {
  const url = new URL(`${getPublicStoreBaseUrl()}/search`);
  const normalizedTerm = searchTerm.trim();
  if (normalizedTerm) {
    url.searchParams.set("q", normalizedTerm);
  }
  url.searchParams.set("options[prefix]", "last");

  if (filters.inStock || filters.size) {
    url.searchParams.set("filter.v.availability", "1");
  }
  if (filters.size) {
    url.searchParams.set("filter.v.option.size", filters.size);
  }
  if (filters.color) {
    url.searchParams.set("filter.p.m.custom.color", toFilterValue(filters.color));
  }
  if (filters.minPrice != null) {
    url.searchParams.set("filter.v.price.gte", String(filters.minPrice));
  }
  if (filters.maxPrice != null) {
    url.searchParams.set("filter.v.price.lte", String(filters.maxPrice));
  }

  const category = normalizeText(filters.category ?? filters.productType);
  if (category && !GENERIC_CATEGORIES.has(category)) {
    url.searchParams.set("filter.p.product_type", toFilterValue(category));
    appendTag(url, category);
  }

  if (filters.brand) {
    url.searchParams.set("filter.p.vendor", toFilterValue(filters.brand));
  }

  const typeMetafield = filters.silhouette ?? filters.model;
  if (typeMetafield) {
    const typeKey =
      category === "basketball"
        ? "basketball_type"
        : category === "running"
          ? "running_type"
          : category === "training"
            ? "training_type"
            : "lifestyle_type";
    url.searchParams.set(`filter.p.m.custom.${typeKey}`, toFilterValue(typeMetafield));
  }

  appendTag(url, filters.gender);
  if (filters.tags && filters.tags !== filters.gender) {
    appendTag(url, filters.tags);
  }

  return url.toString();
}

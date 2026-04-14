import type { Product, SearchFilters, ShopperPreferences } from "../../../shared/types.js";
import { normalizeText } from "./normalize.js";

const REFERENCE_TERMS = ["this", "that", "it", "these", "those", "one", "ones"];
const SIMILARITY_TERMS = ["similar", "same vibe", "like this", "like that", "something like"];
const CHEAPER_TERMS = ["cheaper", "less expensive", "more affordable", "lower price"];
const PREMIUM_TERMS = ["more premium", "cleaner", "better material", "less loud"];

function pickAnchorProduct(query: string, recentProducts: Product[]): Product | null {
  if (recentProducts.length === 0) return null;

  const normalizedQuery = normalizeText(query);

  if (normalizedQuery.includes("first")) return recentProducts[0] ?? null;
  if (normalizedQuery.includes("second")) return recentProducts[1] ?? recentProducts[0] ?? null;
  if (normalizedQuery.includes("third")) return recentProducts[2] ?? recentProducts[0] ?? null;
  if (normalizedQuery.includes("last")) return recentProducts[recentProducts.length - 1] ?? null;
  if (REFERENCE_TERMS.some((term) => normalizedQuery.includes(term))) {
    return recentProducts[recentProducts.length - 1] ?? null;
  }

  if (
    CHEAPER_TERMS.some((term) => normalizedQuery.includes(term)) ||
    SIMILARITY_TERMS.some((term) => normalizedQuery.includes(term)) ||
    PREMIUM_TERMS.some((term) => normalizedQuery.includes(term))
  ) {
    return recentProducts[recentProducts.length - 1] ?? null;
  }

  return null;
}

export function enrichSearchWithContext(params: {
  query: string;
  filters: SearchFilters;
  recentProducts: Product[];
  preferences?: ShopperPreferences;
}): {
  query: string;
  filters: SearchFilters;
  reasoning: string[];
  anchorProduct: Product | null;
} {
  const reasoning: string[] = [];
  const anchorProduct = pickAnchorProduct(params.query, params.recentProducts);
  const normalizedQuery = normalizeText(params.query);
  const filters: SearchFilters = { ...params.filters };

  if (!filters.brand && params.preferences?.favoriteBrand && normalizedQuery.split(/\s+/).length <= 3) {
    filters.brand = params.preferences.favoriteBrand;
    reasoning.push("applied favorite brand preference");
  }

  if (!filters.size && params.preferences?.preferredSize && normalizedQuery.includes("size")) {
    filters.size = params.preferences.preferredSize;
    reasoning.push("applied preferred size preference");
  }

  if (!anchorProduct) {
    return { query: params.query, filters, reasoning, anchorProduct: null };
  }

  if (!filters.category && !filters.productType) {
    filters.category = anchorProduct.productType || params.preferences?.preferredCategory;
    reasoning.push("anchored category to recent product");
  }

  if (
    CHEAPER_TERMS.some((term) => normalizedQuery.includes(term)) &&
    filters.maxPrice == null
  ) {
    const anchorPrice = Number(anchorProduct.priceRange.minVariantPrice.amount);
    if (!Number.isNaN(anchorPrice) && anchorPrice > 0) {
      filters.maxPrice = Math.max(anchorPrice - 1, 0);
      reasoning.push("applied cheaper-than anchor price");
    }
  }

  if (
    SIMILARITY_TERMS.some((term) => normalizedQuery.includes(term)) ||
    PREMIUM_TERMS.some((term) => normalizedQuery.includes(term))
  ) {
    if (!filters.model) {
      filters.model = anchorProduct.title;
      reasoning.push("anchored similarity to recent product title");
    }
  }

  if (
    !filters.color &&
    params.preferences?.preferredColor &&
    (normalizedQuery.includes("same vibe") || normalizedQuery.includes("like that"))
  ) {
    filters.color = params.preferences.preferredColor;
    reasoning.push("applied preferred color to vague follow-up");
  }

  return {
    query: params.query,
    filters,
    reasoning,
    anchorProduct,
  };
}

export function enrichSizeAvailabilityWithContext(params: {
  query?: string;
  handleOrId?: string;
  recentProducts: Product[];
}): {
  query?: string;
  handleOrId?: string;
  anchorProduct: Product | null;
} {
  if (params.handleOrId) {
    return {
      query: params.query,
      handleOrId: params.handleOrId,
      anchorProduct: null,
    };
  }

  const anchorProduct = pickAnchorProduct(params.query ?? "", params.recentProducts);

  return {
    query: params.query,
    handleOrId: anchorProduct?.handle,
    anchorProduct,
  };
}

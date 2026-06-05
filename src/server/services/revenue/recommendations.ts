import type { Product, ProductInsight, SearchFilters } from "../../../shared/types.js";
import { findBestVariantMatch, findSizeOptionValue } from "../size-resolution.js";
import { normalizeText } from "../retrieval/normalize.js";

interface RankedProduct {
  product: Product;
  insight: ProductInsight;
  score: number;
}

function titleCase(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function productHaystack(product: Product): string {
  return [
    product.title,
    product.vendor,
    product.productType,
    product.tags.join(" "),
    product.description,
    product.metafields.customColor,
    product.metafields.recommendedUse,
    product.metafields.styleTags?.join(" "),
    ...product.variants.flatMap((variant) => variant.selectedOptions.map((option) => option.value)),
    ...product.images.flatMap((image) => [image.altText, image.url]),
  ].filter(Boolean).join(" ");
}

function includesTokenish(source: string, value: string): boolean {
  const escaped = normalizeText(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!escaped) return false;
  return new RegExp(`(^|[\\s_./-])${escaped}([\\s_./-]|$)`, "i").test(normalizeText(source));
}

export function productMatchesRequestedColor(product: Product, color: string | undefined): boolean {
  if (!color) return true;
  return includesTokenish(productHaystack(product), color);
}

function categoryBadge(product: Product, filters: SearchFilters): { badge: string | null; score: number } {
  const requested = normalizeText(filters.category ?? filters.productType);
  const productType = normalizeText(product.productType);
  if (!requested || !productType) return { badge: null, score: 0 };

  if (productType.includes(requested) || requested.includes(productType)) {
    if (requested.includes("running")) return { badge: "Best for running", score: 60 };
    if (requested.includes("basket")) return { badge: "Court ready", score: 60 };
    if (requested.includes("training")) return { badge: "Training pick", score: 60 };
    if (requested.includes("lifestyle")) return { badge: "Best for daily", score: 60 };
    return { badge: titleCase(requested), score: 40 };
  }

  return { badge: null, score: -30 };
}

function sizeBadge(product: Product, filters: SearchFilters): { badge: string | null; score: number } {
  if (!filters.size) return { badge: null, score: 0 };

  const match = findBestVariantMatch(product.variants, filters.size);
  if (match.exactMatchAvailable) {
    const rawSize = findSizeOptionValue(match.exactMatchAvailable.selectedOptions) ?? filters.size;
    return { badge: `Size ${rawSize} in stock`, score: 100 };
  }

  if (match.exactMatch) {
    return { badge: `Size ${filters.size} sold out`, score: -60 };
  }

  if (match.closestMatches.length > 0) {
    const closest = match.closestMatches
      .map((variant) => findSizeOptionValue(variant.selectedOptions))
      .filter((entry): entry is string => Boolean(entry))
      .slice(0, 2)
      .join(", ");
    return { badge: closest ? `Closest: ${closest}` : null, score: 15 };
  }

  return { badge: null, score: -20 };
}

function colorBadge(product: Product, filters: SearchFilters): { badge: string | null; score: number } {
  if (!filters.color) return { badge: null, score: 0 };
  return productMatchesRequestedColor(product, filters.color)
    ? { badge: `${titleCase(filters.color)} match`, score: 35 }
    : { badge: null, score: -10 };
}

function budgetBadge(product: Product, filters: SearchFilters): { badge: string | null; score: number } {
  if (filters.maxPrice == null) return { badge: null, score: 0 };
  const price = Number(product.priceRange.minVariantPrice.amount);
  if (!Number.isFinite(price)) return { badge: null, score: 0 };

  return price <= filters.maxPrice
    ? { badge: `Under $${filters.maxPrice}`, score: 25 }
    : { badge: null, score: -35 };
}

function brandScore(product: Product, filters: SearchFilters): number {
  if (!filters.brand) return 0;
  return normalizeText(product.vendor) === normalizeText(filters.brand) ? 25 : -10;
}

function stockBadge(product: Product): { badge: string | null; score: number } {
  const available = product.variants.filter((variant) => variant.availableForSale);
  if (available.length === 0) return { badge: "Out of stock", score: -100 };

  const knownQuantities = available
    .map((variant) => variant.quantityAvailable)
    .filter((value): value is number => typeof value === "number");
  const lowKnownStock = knownQuantities.length > 0 && knownQuantities.every((value) => value <= 2);
  if (available.length <= 2 || lowKnownStock) {
    return { badge: "Low stock", score: 8 };
  }

  return { badge: null, score: Math.min(available.length, 12) };
}

function rankProduct(product: Product, filters: SearchFilters): RankedProduct {
  const badges: string[] = [];
  let score = 0;

  for (const part of [
    sizeBadge(product, filters),
    categoryBadge(product, filters),
    colorBadge(product, filters),
    budgetBadge(product, filters),
    stockBadge(product),
  ]) {
    score += part.score;
    if (part.badge && !badges.includes(part.badge)) badges.push(part.badge);
  }

  score += brandScore(product, filters);

  if (badges.length === 0) badges.push("ORJN pick");

  return {
    product,
    score,
    insight: {
      handle: product.handle,
      badges: badges.slice(0, 4),
      reason: badges[0],
    },
  };
}

export function rankProductsForRevenue(
  products: Product[],
  filters: SearchFilters
): { products: Product[]; insights: ProductInsight[] } {
  const ranked = products
    .map((product, index) => ({ ...rankProduct(product, filters), index }))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  return {
    products: ranked.map((entry) => entry.product),
    insights: ranked.map((entry) => entry.insight),
  };
}

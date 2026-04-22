import type { QueryIntent, QueryUnderstanding, SearchFilters } from "../../../shared/types.js";
import {
  DEFAULT_BRANDS,
  DEFAULT_CATEGORIES,
  DEFAULT_COLORS,
  STYLE_TERMS,
  normalizeText,
  stripStopWords,
  tokenize,
} from "./normalize.js";
import { findCanonicalSynonym } from "./synonyms.js";

const POLICY_TERMS = [
  "shipping",
  "return",
  "refund",
  "exchange",
  "cod",
  "cash on delivery",
  "payment",
  "delivery",
  "policy",
  "support",
];

const AUTHENTICITY_TERMS = ["authentic", "authenticity", "real", "fake", "replica"];
const COMPARISON_TERMS = ["compare", "vs", "versus", "better than"];
const RECOMMENDATION_TERMS = ["recommend", "similar", "like", "vibe", "premium", "everyday", "daily", "retro"];
const AVAILABILITY_TERMS = ["available", "availability", "in stock", "stock", "do you have", "have you got"];
const SIZE_TERMS = ["size", "sizing", "fit"];

function detectIntent(normalizedQuery: string): QueryIntent {
  if (AUTHENTICITY_TERMS.some((term) => normalizedQuery.includes(term))) {
    return "authenticity";
  }
  if (POLICY_TERMS.some((term) => normalizedQuery.includes(term))) {
    return "policy_support";
  }
  if (COMPARISON_TERMS.some((term) => normalizedQuery.includes(term))) {
    return "comparison";
  }
  if (AVAILABILITY_TERMS.some((term) => normalizedQuery.includes(term))) {
    return SIZE_TERMS.some((term) => normalizedQuery.includes(term))
      ? "size_lookup"
      : "availability_check";
  }
  if (SIZE_TERMS.some((term) => normalizedQuery.includes(term))) {
    return "size_lookup";
  }
  if (RECOMMENDATION_TERMS.some((term) => normalizedQuery.includes(term))) {
    return "recommendations";
  }
  return "product_search";
}

function extractPriceFilters(normalizedQuery: string): Pick<SearchFilters, "minPrice" | "maxPrice"> {
  const maxMatch = normalizedQuery.match(/\b(?:under|below|less than|max)\s*\$?(\d+(?:\.\d+)?)\b/);
  const minMatch = normalizedQuery.match(/\b(?:over|above|more than|min)\s*\$?(\d+(?:\.\d+)?)\b/);

  return {
    minPrice: minMatch ? Number(minMatch[1]) : undefined,
    maxPrice: maxMatch ? Number(maxMatch[1]) : undefined,
  };
}

function extractSize(normalizedQuery: string): string | undefined {
  const explicit = normalizedQuery.match(/\bsize\s*(\d{1,2}(?:\.\d)?)\b/);
  if (explicit) return explicit[1];

  const eu = normalizedQuery.match(/\beu\s*(\d{1,2}(?:\.\d)?)\b/);
  if (eu) return eu[1];

  return undefined;
}

function deriveModel(normalizedQuery: string, removableTerms: string[], extractedSize?: string): string | undefined {
  let working = normalizedQuery;
  for (const term of removableTerms.filter(Boolean)) {
    working = working.replace(new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), " ");
  }

  // Only strip the explicitly extracted size number — preserve model numbers like "1" in
  // "Air Force 1", "270" in "Air Max 270", "990" in "New Balance 990".
  const tokens = stripStopWords(tokenize(working)).filter(
    (token) => !(extractedSize && token === extractedSize)
  );
  return tokens.length > 0 ? tokens.join(" ") : undefined;
}

export async function understandCatalogQuery(query: string): Promise<QueryUnderstanding> {
  const normalizedQuery = normalizeText(query);
  const intent = detectIntent(normalizedQuery);

  const brand =
    (await findCanonicalSynonym(normalizedQuery, "brand")) ??
    DEFAULT_BRANDS.find((entry) => normalizedQuery.includes(entry));

  const category =
    (await findCanonicalSynonym(normalizedQuery, "category")) ??
    DEFAULT_CATEGORIES.find((entry) => normalizedQuery.includes(entry));

  const color = DEFAULT_COLORS.find((entry) => normalizedQuery.includes(entry));
  const styleTerms = STYLE_TERMS.filter((entry) => normalizedQuery.includes(entry));
  const size = extractSize(normalizedQuery);
  const priceFilters = extractPriceFilters(normalizedQuery);
  const silhouette = (await findCanonicalSynonym(normalizedQuery, "model")) ?? undefined;

  // Gender — "men" / "women" / "male" / "female" are Shopify product tags, not model names.
  // Detect them here so they become a tags filter instead of polluting the model field.
  const genderMatch = normalizedQuery.match(/\b(men|women|male|female|mens|womens|men's|women's)\b/);
  const genderTag = genderMatch
    ? genderMatch[1].startsWith("men") ? "men" : "women"
    : undefined;

  const model = deriveModel(normalizedQuery, [
    brand ?? "",
    category ?? "",
    color ?? "",
    silhouette ?? "",
    genderTag ?? "",
    "men",
    "women",
    "mens",
    "womens",
    "size",
    "under",
    "below",
    "over",
    "above",
    ...styleTerms,
  ], size);

  const filters: SearchFilters = {
    brand: brand ? brand.replace(/\b\w/g, (char) => char.toUpperCase()) : undefined,
    model,
    silhouette,
    category,
    color,
    tags: genderTag,
    size,
    minPrice: priceFilters.minPrice,
    maxPrice: priceFilters.maxPrice,
    inStock:
      intent === "availability_check" ||
      intent === "size_lookup" ||
      normalizedQuery.includes("in stock"),
  };

  return {
    normalizedQuery,
    intent,
    filters,
    entities: {
      brand: filters.brand,
      model,
      silhouette,
      size,
      color,
      category,
      tags: genderTag,
      styleTerms,
      rawTerms: tokenize(normalizedQuery),
    },
  };
}

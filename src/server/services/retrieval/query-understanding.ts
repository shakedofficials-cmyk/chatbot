import OpenAI from "openai";
import type { QueryIntent, QueryUnderstanding, SearchFilters } from "../../../shared/types.js";
import { env } from "../../config.js";
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

const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

interface UnderstandingOptions {
  useAi?: boolean;
}

interface AiCatalogInterpretation {
  searchTerm: string | null;
  intent: QueryIntent;
  brand: string | null;
  model: string | null;
  silhouette: string | null;
  category: string | null;
  color: string | null;
  gender: string | null;
  size: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  inStock: boolean | null;
  confidence: number;
}

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
const PRODUCT_INTENTS = new Set<QueryIntent>([
  "product_search",
  "availability_check",
  "size_lookup",
  "recommendations",
  "comparison",
]);

const AI_QUERY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "searchTerm",
    "intent",
    "brand",
    "model",
    "silhouette",
    "category",
    "color",
    "gender",
    "size",
    "minPrice",
    "maxPrice",
    "inStock",
    "confidence",
  ],
  properties: {
    searchTerm: { type: ["string", "null"] },
    intent: {
      type: "string",
      enum: [
        "product_search",
        "availability_check",
        "size_lookup",
        "recommendations",
        "comparison",
        "policy_support",
        "authenticity",
        "general_chat",
      ],
    },
    brand: { type: ["string", "null"] },
    model: { type: ["string", "null"] },
    silhouette: { type: ["string", "null"] },
    category: { type: ["string", "null"] },
    color: { type: ["string", "null"] },
    gender: { type: ["string", "null"], enum: ["men", "women", null] },
    size: { type: ["string", "null"] },
    minPrice: { type: ["number", "null"] },
    maxPrice: { type: ["number", "null"] },
    inStock: { type: ["boolean", "null"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
};

const AI_QUERY_PROMPT = `You turn messy sneaker shopping messages into structured catalog search intent.

Return only JSON matching the schema.

Rules:
- Extract the real product/search phrase. Strip filler like "I am looking for", "show me", "give me", "need", "want".
- searchTerm must be short and storefront-search friendly. Example: "am looking for a way of wade" -> "way of wade".
- Preserve unknown shoe model names. Do not require a whitelist. There are thousands of models.
- Keep meaningful connector words inside model names, e.g. "Way of Wade", "Air Force 1".
- model is only a named shoe line/model/silhouette. For "blue running shoes", model is null, category is running, color is blue.
- Do not infer parent brands that the customer did not type. If they write "Way of Wade", brand is null unless they also write "Li-Ning".
- Use category only for use cases/types like lifestyle, running, basketball, training.
- Use gender only for men/women requests.
- Use USD prices only. "under 250" means maxPrice 250.
- inStock is true for explicit stock/availability/size requests and normal product-finding requests.`;

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

function stripShoppingLanguage(value: string): string {
  let working = normalizeText(value);
  for (let i = 0; i < 4; i += 1) {
    const next = working
      .replace(/^(?:i\s+am|i m|im|am|i|we\s+are|we)\s+/i, "")
      .replace(/^(?:looking|look|searching|seeking|trying|hunting)\s+(?:for\s+|to\s+find\s+|to\s+buy\s+)?/i, "")
      .replace(/^(?:find|show|get|give|suggest|recommend|search)\s+(?:me\s+)?/i, "")
      .replace(/^(?:want|need)\s+(?:a\s+|an\s+|some\s+)?/i, "")
      .replace(/^(?:a|an|some)\s+/i, "")
      .trim();
    if (next === working) break;
    working = next;
  }
  return working;
}

function deriveModel(normalizedQuery: string, removableTerms: string[], extractedSize?: string): string | undefined {
  let working = stripShoppingLanguage(normalizedQuery);
  for (const term of removableTerms.filter(Boolean)) {
    working = working.replace(new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), " ");
  }
  working = working
    .replace(/\b(?:under|below|less than|max|over|above|more than|min)\s*\$?\d+(?:\.\d+)?\b/g, " ")
    .replace(/\b(?:usd|dollars?)\b/g, " ");

  // Only strip the explicitly extracted size number — preserve model numbers like "1" in
  // "Air Force 1", "270" in "Air Max 270", "990" in "New Balance 990".
  const tokens = stripStopWords(tokenize(working)).filter(
    (token) => !(extractedSize && token === extractedSize)
  );
  return tokens.length > 0 ? tokens.join(" ") : undefined;
}

function titleCase(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function canonicalCategory(value: string | null | undefined): string | undefined {
  const normalized = normalizeText(value);
  if (!normalized) return undefined;
  if (normalized === "basket" || normalized.includes("basketball")) return "basketball";
  if (normalized.includes("running") || normalized === "runner") return "running";
  if (normalized.includes("training")) return "training";
  if (normalized.includes("lifestyle")) return "lifestyle";
  if (DEFAULT_CATEGORIES.includes(normalized)) return normalized;
  return undefined;
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = normalizeText(value);
  return normalized || undefined;
}

function cleanNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

function appearsInQuery(query: string, value: string | undefined): boolean {
  if (!value) return false;
  return normalizeText(query).includes(normalizeText(value));
}

function extractResponseText(response: unknown): string {
  const outputText = (response as { output_text?: unknown }).output_text;
  if (typeof outputText === "string") return outputText;

  return ((response as { output?: Array<any> }).output ?? [])
    .filter((item: any) => item.type === "message")
    .flatMap((item: any) => item.content ?? [])
    .filter((content: any) => content.type === "output_text")
    .map((content: any) => content.text)
    .join("\n");
}

function buildSearchTerm(
  normalizedQuery: string,
  filters: SearchFilters,
  aiSearchTerm?: string
): string | undefined {
  const cleanedAiTerm = cleanString(aiSearchTerm);
  if (cleanedAiTerm) return cleanedAiTerm;
  if (filters.silhouette) return filters.silhouette;
  if (filters.model) return filters.model;
  if (filters.brand) return filters.brand;
  if (filters.category) return filters.category;
  if (filters.productType) return filters.productType;

  const stripped = stripShoppingLanguage(normalizedQuery)
    .replace(/\b(?:size|eu)\s*\d{1,2}(?:\.\d)?\b/gi, "")
    .replace(/\b(?:under|below|less than|max|over|above|more than|min)\s*\$?\d+(?:\.\d+)?\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return stripped || undefined;
}

async function interpretWithOpenAI(
  query: string,
  fallback: QueryUnderstanding
): Promise<AiCatalogInterpretation | null> {
  if (!openai || !PRODUCT_INTENTS.has(fallback.intent)) return null;

  try {
    const response = await openai.responses.create({
      model: env.OPENAI_MODEL,
      instructions: AI_QUERY_PROMPT,
      input: [
        {
          role: "user",
          content: [
            `Customer message: ${query}`,
            `Deterministic fallback: ${JSON.stringify({
              intent: fallback.intent,
              filters: fallback.filters,
              searchTerm: fallback.entities.searchTerm,
            })}`,
          ].join("\n"),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "catalog_query_interpretation",
          strict: true,
          schema: AI_QUERY_SCHEMA,
        },
      },
    } as any);

    const text = extractResponseText(response);
    if (!text) return null;
    return JSON.parse(text) as AiCatalogInterpretation;
  } catch (error) {
    console.warn("[query-understanding] OpenAI interpretation failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function mergeAiUnderstanding(
  query: string,
  fallback: QueryUnderstanding,
  ai: AiCatalogInterpretation | null
): QueryUnderstanding {
  if (!ai || ai.confidence < 0.35) return fallback;

  const brand = cleanString(ai.brand);
  const model = cleanString(ai.model);
  const silhouette = cleanString(ai.silhouette);
  const category = canonicalCategory(ai.category);
  const color = cleanString(ai.color);
  const gender = cleanString(ai.gender);
  const size = cleanString(ai.size);
  const effectiveModel = model ?? fallback.filters.model;
  const brandDuplicatesModel = Boolean(
    brand &&
      effectiveModel &&
      normalizeText(brand) === normalizeText(effectiveModel)
  );
  const mergedFilters: SearchFilters = {
    ...fallback.filters,
    brand: brand && !brandDuplicatesModel && appearsInQuery(query, brand)
      ? titleCase(brand)
      : fallback.filters.brand,
    model: effectiveModel,
    silhouette: silhouette ?? fallback.filters.silhouette,
    category: category ?? fallback.filters.category,
    color: color ?? fallback.filters.color,
    gender: gender === "men" || gender === "women" ? gender : fallback.filters.gender,
    tags: gender === "men" || gender === "women" ? gender : fallback.filters.tags,
    size: size ?? fallback.filters.size,
    minPrice: cleanNumber(ai.minPrice) ?? fallback.filters.minPrice,
    maxPrice: cleanNumber(ai.maxPrice) ?? fallback.filters.maxPrice,
    inStock: ai.inStock ?? fallback.filters.inStock,
  };
  const searchTerm = buildSearchTerm(fallback.normalizedQuery, mergedFilters, ai.searchTerm ?? undefined);

  return {
    normalizedQuery: fallback.normalizedQuery,
    intent: ai.intent ?? fallback.intent,
    filters: mergedFilters,
    entities: {
      ...fallback.entities,
      brand: mergedFilters.brand,
      model: mergedFilters.model,
      silhouette: mergedFilters.silhouette,
      size: mergedFilters.size,
      color: mergedFilters.color,
      category: mergedFilters.category,
      gender: mergedFilters.gender,
      tags: mergedFilters.tags,
      searchTerm,
      rawTerms: tokenize(searchTerm ?? fallback.normalizedQuery),
    },
  };
}

export async function understandCatalogQuery(
  query: string,
  options: UnderstandingOptions = {}
): Promise<QueryUnderstanding> {
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
  const normalizedCategory = category === "basket" ? "basketball" : category;

  const model = deriveModel(normalizedQuery, [
    brand ?? "",
    normalizedCategory ?? "",
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
    category: normalizedCategory,
    color,
    gender: genderTag,
    tags: genderTag,
    size,
    minPrice: priceFilters.minPrice,
    maxPrice: priceFilters.maxPrice,
    inStock:
      intent === "availability_check" ||
      intent === "size_lookup" ||
      normalizedQuery.includes("in stock"),
  };

  const searchTerm = buildSearchTerm(normalizedQuery, filters);
  const fallback: QueryUnderstanding = {
    normalizedQuery,
    intent,
    filters,
    entities: {
      brand: filters.brand,
      model,
      silhouette,
      size,
      color,
      category: normalizedCategory,
      gender: genderTag,
      tags: genderTag,
      searchTerm,
      styleTerms,
      rawTerms: tokenize(normalizedQuery),
    },
  };

  if (!options.useAi) return fallback;

  return mergeAiUnderstanding(query, fallback, await interpretWithOpenAI(query, fallback));
}
